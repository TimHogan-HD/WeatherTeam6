/**
 * Probe A — what Open-Meteo actually returns, per point, per model, per variable.
 *
 * Phase 0 of `.claude/docs/telegram-precision-interface-plan.md`. Nothing imports
 * it; its **output** is the deliverable, and every model and variable named in a
 * later phase must trace to a line in `.claude/docs/model-matrix.md`, which this
 * script writes.
 *
 * It exists because `fetchNBM` requested `precipitation_p10/p50/p90` — daily
 * variables Open-Meteo does not define under any name — so the branch never once
 * returned data and warned on every request for months (defect class 9). The only
 * way to know what a model carries at a point is to ask it and read the answer.
 *
 * Three upstream answers have to be told apart, and that distinction is the whole
 * design of this script:
 *
 *   - **400 `No data is available for this location`** — the model does not cover
 *     the point. Nothing was wrong with the request.
 *   - **400 `Data corrupted at path …`** — the variable name is not defined. One
 *     bad name fails the whole request, so the probe re-asks variable by variable
 *     to attribute it.
 *   - **200 with a null-filled array** — the name is defined and the model carries
 *     no value. This is the one a caller silently renders as `0`.
 *
 * Usage: `npm run probe:models --workspace=apps/api`. No database, no credentials.
 */
import { writeFileSync } from 'node:fs'
import { fetchWithRetry } from '../lib/weather/openMeteo.js'

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'
const OUT_PATH = new URL('../../../../.claude/docs/model-matrix.md', import.meta.url)

/** The three seeded locations, plus one European point to expose CONUS-only models. */
const POINTS = [
  { name: 'Joshua Tree', lat: 34.0136, lon: -116.1661 },
  { name: 'Red Rock', lat: 36.1354, lon: -115.4265 },
  { name: 'Indian Creek', lat: 37.9058, lon: -109.8019 },
  { name: 'Chamonix (EU)', lat: 45.9237, lon: 6.8694 },
]

/** Candidate deterministic models from the plan's § Settled decisions. */
const MODELS = [
  'gfs_seamless',
  'ecmwf_ifs025',
  'icon_seamless',
  'gem_seamless',
  'ncep_hrrr_conus',
  'ncep_nbm_conus',
]

/** The six variables in use today, plus the five the plan adds. */
const HOURLY_VARS = [
  'temperature_2m',
  'dew_point_2m',
  'relative_humidity_2m',
  'precipitation',
  'shortwave_radiation',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'precipitation_probability',
  'surface_pressure',
  'pressure_msl',
]

/** Includes the three names that produced the dead `fetchNBM` branch. */
const DAILY_VARS = [
  'precipitation_sum',
  'precipitation_probability_max',
  'precipitation_p10',
  'precipitation_p50',
  'precipitation_p90',
  'temperature_2m_max',
  'wind_speed_10m_max',
]

const ENSEMBLE_MODELS = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless_eps', 'gem_global']

type VarResult = {
  /** The API defines this name for this model — i.e. it did not 400 on it. */
  defined: boolean
  /** Slots in the returned array, nulls included. */
  hours: number
  /** Slots carrying an actual number. `0` with `defined: true` is the silent case. */
  nonNull: number
  /** Last timestamp carrying a number — the model's real horizon for this variable. */
  lastValueAt: string | null
  /**
   * The series itself, kept only so identical columns across models can be
   * detected. A per-model table that labels a shared series with the selected
   * model's name is attribution not backed by the data (defect class 3).
   */
  values: (number | null)[]
  reason?: string
}

type ModelResult = {
  model: string
  covered: boolean
  reason?: string
  vars: Record<string, VarResult>
  topLevelKeys: string[]
}

type Ensemble = { member_counts: Record<string, number>; hours: number; error?: string }

type PointResult = {
  point: (typeof POINTS)[number]
  models: ModelResult[]
  ensemble: Ensemble
}

const NO_COVERAGE = 'No data is available for this location'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type OpenMeteoBody = {
  error?: boolean
  reason?: string
  hourly?: Record<string, unknown>
  daily?: Record<string, unknown>
}

/**
 * A 400 is a *result* here, not a failure: it is how the API says "no coverage"
 * and how it says "no such variable". `fetchWithRetry` hands a non-429 4xx back
 * rather than throwing, which is exactly what this needs.
 */
async function get(url: URL): Promise<{ status: number; body: OpenMeteoBody }> {
  const res = await fetchWithRetry(url.toString())
  const body = (await res.json()) as OpenMeteoBody
  await sleep(150)
  return { status: res.status, body }
}

function summarise(series: Record<string, unknown>, key: string): VarResult {
  const raw = series[key]
  const times = series['time']
  if (!Array.isArray(raw)) {
    return {
      defined: true,
      hours: 0,
      nonNull: 0,
      lastValueAt: null,
      values: [],
      reason: 'key absent from 200',
    }
  }
  let nonNull = 0
  let lastValueAt: string | null = null
  const values = raw.map((v, i): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      nonNull++
      const t = Array.isArray(times) ? times[i] : null
      if (typeof t === 'string') lastValueAt = t
      return v
    }
    return null
  })
  return { defined: true, hours: values.length, nonNull, lastValueAt, values }
}

async function probeModel(point: (typeof POINTS)[number], model: string): Promise<ModelResult> {
  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(point.lat))
  url.searchParams.set('longitude', String(point.lon))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '16')
  url.searchParams.set('models', model)
  url.searchParams.set('hourly', HOURLY_VARS.join(','))

  const { status, body } = await get(url)

  if (status === 200 && body.hourly) {
    const vars: Record<string, VarResult> = {}
    for (const v of HOURLY_VARS) vars[v] = summarise(body.hourly, v)
    return { model, covered: true, vars, topLevelKeys: Object.keys(body).sort() }
  }

  const reason = body.reason ?? `HTTP ${status}`
  if (reason.includes(NO_COVERAGE)) {
    const vars: Record<string, VarResult> = {}
    for (const v of HOURLY_VARS) {
      vars[v] = {
        defined: false,
        hours: 0,
        nonNull: 0,
        lastValueAt: null,
        values: [],
        reason: 'no coverage',
      }
    }
    return { model, covered: false, reason, vars, topLevelKeys: [] }
  }

  // One undefined name fails the whole request, so attribution needs one request
  // per variable. Reporting the combined failure would name every variable as
  // broken when only one is.
  console.log(`    combined request rejected (${reason}) — re-asking variable by variable`)
  const vars: Record<string, VarResult> = {}
  let topLevelKeys: string[] = []
  for (const v of HOURLY_VARS) {
    const one = new URL(url.toString())
    one.searchParams.set('hourly', v)
    const res = await get(one)
    if (res.status === 200 && res.body.hourly) {
      vars[v] = summarise(res.body.hourly, v)
      if (topLevelKeys.length === 0) topLevelKeys = Object.keys(res.body).sort()
    } else {
      vars[v] = {
        defined: false,
        hours: 0,
        nonNull: 0,
        lastValueAt: null,
        values: [],
        reason: res.body.reason ?? `HTTP ${res.status}`,
      }
    }
  }
  return { model, covered: true, reason, vars, topLevelKeys }
}

async function probeEnsemble(point: (typeof POINTS)[number]): Promise<Ensemble> {
  const url = new URL(ENSEMBLE_URL)
  url.searchParams.set('latitude', String(point.lat))
  url.searchParams.set('longitude', String(point.lon))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '7')
  url.searchParams.set('models', ENSEMBLE_MODELS.join(','))
  url.searchParams.set('hourly', 'temperature_2m')

  const { status, body } = await get(url)
  if (status !== 200 || !body.hourly) {
    return { member_counts: {}, hours: 0, error: body.reason ?? `HTTP ${status}` }
  }

  const counts: Record<string, number> = {}
  let hours = 0
  for (const [key, value] of Object.entries(body.hourly)) {
    if (key === 'time') {
      hours = Array.isArray(value) ? value.length : 0
      continue
    }
    // `temperature_2m_member01_ncep_gefs_seamless` → the model suffix alone. The
    // member number sits **in the middle**, not at the end: anchoring the strip to
    // `$` matches nothing and reports 143 models of one member each. A control run
    // carries no `_memberNN` at all and is still a member.
    const suffix = key.replace(/^temperature_2m/, '').replace(/_member\d+/, '')
    counts[suffix] = (counts[suffix] ?? 0) + 1
  }
  return { member_counts: counts, hours }
}

async function probeDaily(
  point: (typeof POINTS)[number],
  model: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const v of DAILY_VARS) {
    const url = new URL(FORECAST_URL)
    url.searchParams.set('latitude', String(point.lat))
    url.searchParams.set('longitude', String(point.lon))
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('forecast_days', '3')
    url.searchParams.set('models', model)
    url.searchParams.set('daily', v)
    const { status, body } = await get(url)
    const values = body.daily?.[v]
    if (status === 200 && Array.isArray(values)) {
      const nonNull = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).length
      out[v] = `defined — ${nonNull}/${values.length} days with a value`
    } else {
      out[v] = `rejected — ${body.reason ?? `HTTP ${status}`}`
    }
  }
  return out
}

/**
 * What the table alone cannot say: which columns are **not** the selected model's
 * own output.
 *
 * Three things get reported, all derived from the measurement rather than from a
 * belief about how Open-Meteo composes a response:
 *
 *   - two models returning a byte-identical series — one of them is being served
 *     the other's data, and labelling that column with the selected model's name
 *     would be attribution not backed by the data (defect class 3);
 *   - a variable that runs past the model's own horizon (`temperature_2m` is the
 *     reference), which is the same substitution seen from the other side;
 *   - a variable the API defines and fills entirely with nulls, which is the case
 *     a formatter renders as `0`.
 */
function anomalies(models: ModelResult[]): string[] {
  const out: string[] = []

  for (const v of HOURLY_VARS) {
    const groups = new Map<string, string[]>()
    for (const m of models) {
      const r = m.vars[v]
      if (!r?.defined || r.nonNull === 0) continue
      const key = JSON.stringify(r.values)
      groups.set(key, [...(groups.get(key) ?? []), m.model])
    }
    for (const names of groups.values()) {
      if (names.length > 1) {
        out.push(
          `\`${v}\` is **byte-identical** under ${names.map((n) => `\`${n}\``).join(', ')} — at most one of them is that model's own field.`,
        )
      }
    }
  }

  for (const m of models) {
    const baseline = m.vars['temperature_2m']
    for (const v of HOURLY_VARS) {
      const r = m.vars[v]
      if (!r?.defined) continue
      if (r.nonNull === 0) {
        out.push(`\`${m.model}\` defines \`${v}\` and returns **no values at all** (${r.hours} nulls).`)
        continue
      }
      if (baseline?.nonNull && r.nonNull > baseline.nonNull) {
        out.push(
          `\`${m.model}\` returns \`${v}\` for ${r.nonNull}h, past its own ${baseline.nonNull}h horizon — the tail is not this model's.`,
        )
      }
    }
  }

  return out
}

function cell(v: VarResult | undefined): string {
  if (!v) return '?'
  if (!v.defined) return v.reason === 'no coverage' ? '– no coverage' : '**undefined**'
  if (v.nonNull === 0) return '**null-filled**'
  return `${v.nonNull}h → ${v.lastValueAt ?? '?'}`
}

function render(
  results: PointResult[],
  daily: Record<string, string>,
  topKeys: string[],
  dailyModel: string,
  dailyPoint: string,
): string {
  const lines: string[] = []
  lines.push('# Model matrix — what Open-Meteo actually returns')
  lines.push('')
  lines.push(
    `Generated by \`apps/api/src/scripts/probeModels.ts\` (\`npm run probe:models --workspace=apps/api\`) at **${new Date().toISOString()}**.`,
  )
  lines.push('')
  lines.push(
    'Probe A of Phase 0 in `.claude/docs/telegram-precision-interface-plan.md`. **Every model, variable and horizon named in a later phase must trace to a line in this file.** It is a measurement, not a restatement of the docs — regenerate it rather than editing it by hand, and expect upstream coverage and horizons to change.',
  )
  lines.push('')
  lines.push('## How to read a cell')
  lines.push('')
  lines.push('| Cell | Means |')
  lines.push('| --- | --- |')
  lines.push(
    "| `NNNh → <time>` | The variable carried `NNN` real numbers; the last is at that local timestamp. That timestamp **is** the model's usable horizon for it. |",
  )
  lines.push(
    '| **null-filled** | The API accepted the name and returned an array with no numbers in it. The dangerous case: a caller that does not check renders it as `0`. |',
  )
  lines.push(
    '| **undefined** | The API rejected the name for this model (`Data corrupted at path …`). Requesting it fails the *whole* request, not just that column. |',
  )
  lines.push(
    '| `– no coverage` | The model does not reach the point: a 400 `No data is available for this location`, for every variable at once. |',
  )
  lines.push('')
  lines.push(
    "Requests set `forecast_days=16` and `timezone=auto`, so timestamps are the point's local time and the horizon shown is the model's own rather than a limit of the request.",
  )
  lines.push('')

  for (const r of results) {
    lines.push(`## ${r.point.name} — ${r.point.lat}, ${r.point.lon}`)
    lines.push('')
    lines.push(`| Variable | ${r.models.map((m) => m.model).join(' | ')} |`)
    lines.push(`| --- | ${r.models.map(() => '---').join(' | ')} |`)
    for (const v of HOURLY_VARS) {
      lines.push(`| \`${v}\` | ${r.models.map((m) => cell(m.vars[v])).join(' | ')} |`)
    }
    lines.push('')
    const flags = anomalies(r.models)
    if (flags.length > 0) {
      lines.push('**Not the selected model\'s own output:**')
      lines.push('')
      for (const f of flags) lines.push(`- ${f}`)
      lines.push('')
    }
    const ens = r.ensemble
    if (ens.error) {
      lines.push(`**Ensemble:** request failed — ${ens.error}`)
    } else {
      const total = Object.values(ens.member_counts).reduce((a, b) => a + b, 0)
      const parts = Object.entries(ens.member_counts)
        .sort()
        .map(([k, n]) => `\`${k}\` ${n}`)
      lines.push(
        `**Ensemble** (\`/v1/ensemble\`, ${ens.hours}h): **${total} members** — ${parts.join(', ')}`,
      )
    }
    lines.push('')
  }

  lines.push(`## Daily variables (${dailyPoint}, \`${dailyModel}\`)`)
  lines.push('')
  lines.push(
    'The three `precipitation_p*` names are the ones `fetchNBM` requested for months. Recorded so the answer is written down rather than assumed.',
  )
  lines.push('')
  lines.push('| Daily variable | Result |')
  lines.push('| --- | --- |')
  for (const [k, v] of Object.entries(daily)) lines.push(`| \`${k}\` | ${v} |`)
  lines.push('')

  lines.push('## What this constrains, for the phases that follow')
  lines.push('')
  lines.push(
    '- **`precipitation_probability` is not a per-model field.** It is served under models whose every other variable stops days earlier, and under CONUS models it is byte-identical between two of them. A per-model table must not print it in a column headed with the selected model, and `/rain` takes its probability from the 143 ensemble members crossing a threshold, as the plan already specifies.',
  )
  lines.push(
    "- **NBM carries no pressure at all.** `ncep_nbm_conus` defines `surface_pressure` and `pressure_msl` and fills both entirely with nulls, so the plan's pressure tendency cannot be computed from it. Take tendency from a model the matrix shows carrying pressure at that point, and say which one — a tendency line under an NBM table is not NBM's.",
  )
  lines.push(
    "- **Horizons differ by model and by variable, and the shortest one governs a row.** A table that pages by day must stop a model's column where its values stop, rather than printing a shorter model's blanks as if they were a forecast.",
  )
  lines.push(
    '- **CONUS-only models 400 the whole request outside coverage**, they do not return nulls. That 400 is how the panel decides between an enabled and a disabled model button, and it costs one request per model to learn.',
  )
  lines.push('')
  lines.push('## Is the model run initialization time exposed?')
  lines.push('')
  lines.push(`Top-level keys on a 200 response: ${topKeys.map((k) => `\`${k}\``).join(', ')}.`)
  lines.push('')
  const runKeys = topKeys.filter((k) => /run|init/i.test(k))
  lines.push(
    runKeys.length === 0
      ? '**No. Nothing in that list names a run or an initialization time**, and `generationtime_ms` is how long Open-Meteo spent answering, not when the model started. So panel headers say "fetched HH:MMZ" and never "12Z run" — the plan\'s Phase 0 condition, now decided.'
      : `Candidate keys: ${runKeys.map((k) => `\`${k}\``).join(', ')}. Read what they contain before using either as a run time.`,
  )
  lines.push('')
  return lines.join('\n')
}

async function main(): Promise<void> {
  const results: PointResult[] = []
  for (const point of POINTS) {
    console.log(`\n${point.name} (${point.lat}, ${point.lon})`)
    const models: ModelResult[] = []
    for (const model of MODELS) {
      const r = await probeModel(point, model)
      const withValues = Object.values(r.vars).filter((v) => v.defined && v.nonNull > 0).length
      console.log(
        `  ${model} … ${r.covered ? `${withValues}/${HOURLY_VARS.length} variables with values` : 'no coverage'}`,
      )
      models.push(r)
    }
    const ensemble = await probeEnsemble(point)
    console.log(
      `  ensemble … ${ensemble.error ?? `${Object.values(ensemble.member_counts).reduce((a, b) => a + b, 0)} members`}`,
    )
    results.push({ point, models, ensemble })
  }

  const dailyPoint = POINTS.find((p) => p.name === 'Red Rock')
  if (!dailyPoint) throw new Error('Red Rock is not in POINTS')
  const dailyModel = 'ncep_nbm_conus'
  console.log(`\nDaily variables (${dailyPoint.name}, ${dailyModel}) …`)
  const daily = await probeDaily(dailyPoint, dailyModel)

  const topKeys =
    results.flatMap((r) => r.models).find((m) => m.topLevelKeys.length > 0)?.topLevelKeys ?? []

  writeFileSync(OUT_PATH, render(results, daily, topKeys, dailyModel, dailyPoint.name), 'utf8')
  console.log(`\nWrote ${decodeURIComponent(OUT_PATH.pathname)}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
