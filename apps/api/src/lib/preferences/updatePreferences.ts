import {
  TEMP_RANGE_LIMITS_F,
  cToF,
  effectiveTempRangeC,
  isDetailTab,
  type Preferences,
  type UpdatePreferencesInput,
} from '@weatherteam6/types'

/**
 * **`PUT /preferences`, minus the database** — scoring Phase 5. Pure, so every
 * refusal is reachable from the test suite; the route reads the row, calls
 * `planPreferencesUpdate`, and upserts what it returns.
 */

const FIELDS = ['temp_low_c', 'temp_high_c', 'default_tab'] as const

/**
 * Bounds are checked in °F, the unit they are written in, at a tenth of a
 * degree — a client that sends whole °F converted to °C must not be refused for
 * the float rounding of its own conversion.
 */
function asF(c: number): number {
  return Math.round(cToF(c) * 10) / 10
}

/**
 * Validate the body. **An unknown key is refused, not ignored** — a client
 * sending `ideal_temp_min_c` (the Phase 0 column, which nothing reads) would
 * otherwise get a 200 and no change, which reads as success.
 */
export function parsePreferencesUpdate(body: unknown): UpdatePreferencesInput | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' }
  }
  const raw = body as Record<string, unknown>
  const unknown = Object.keys(raw).filter((k) => !(FIELDS as readonly string[]).includes(k))
  if (unknown.length > 0) {
    return { error: `Unsupported field(s): ${unknown.join(', ')} — editable fields are ${FIELDS.join(', ')}` }
  }
  if (!FIELDS.some((k) => k in raw)) {
    return { error: `Nothing to update — editable fields are ${FIELDS.join(', ')}` }
  }

  const out: UpdatePreferencesInput = {}
  const { lowMin, lowMax, highMin, highMax } = TEMP_RANGE_LIMITS_F

  for (const [key, min, max] of [
    ['temp_low_c', lowMin, lowMax],
    ['temp_high_c', highMin, highMax],
  ] as const) {
    if (!(key in raw)) continue
    const v = raw[key]
    if (v === null) {
      out[key] = null
    } else if (typeof v !== 'number' || !Number.isFinite(v) || asF(v) < min || asF(v) > max) {
      return { error: `${key} must be °C between ${min} °F and ${max} °F, or null` }
    } else {
      out[key] = v
    }
  }

  if ('default_tab' in raw) {
    const v = raw['default_tab']
    if (v !== null && !isDetailTab(v)) return { error: 'default_tab must be one of the crag tabs, or null' }
    out.default_tab = v
  }

  return out
}

export type PreferencesPlan = { ok: true; next: Preferences } | { ok: false; status: 409; error: string }

/**
 * The row after the update, or why not. **The gap is checked on the range the
 * score will use**, so a low end set alone is checked against the default high
 * end it will sit under, not against nothing.
 */
export function planPreferencesUpdate(current: Preferences, update: UpdatePreferencesInput): PreferencesPlan {
  const next: Preferences = { ...current, ...update }
  const { lowC, highC } = effectiveTempRangeC(next)
  if (asF(highC) - asF(lowC) < TEMP_RANGE_LIMITS_F.minGap) {
    return {
      ok: false,
      status: 409,
      error: `The range must be at least ${TEMP_RANGE_LIMITS_F.minGap} °F wide`,
    }
  }
  return { ok: true, next }
}

/** A stored row, as the API returns it. An unrecognised stored tab reads as unset. */
export function preferencesFromRow(
  row: { temp_low_c: number | null; temp_high_c: number | null; default_tab: string | null } | undefined,
): Preferences {
  if (row === undefined) return { temp_low_c: null, temp_high_c: null, default_tab: null }
  return {
    temp_low_c: row.temp_low_c,
    temp_high_c: row.temp_high_c,
    default_tab: isDetailTab(row.default_tab) ? row.default_tab : null,
  }
}
