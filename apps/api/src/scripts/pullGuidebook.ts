/**
 * Regenerates `src/lib/guidebook/guidebookMn.ts` — every Minnesota area and
 * route in OpenBeta — from `https://api.openbeta.io/`.
 *
 *   npm run guidebook:pull --workspace=apps/api
 *
 * **Why a snapshot and not a live call:** the same API took 4-13 s per query
 * and 502'd on two of seven when the `/add` search was built
 * (`api-sources.md`), which is the reason `climbingAreasMn.ts` is a generated
 * file too. Route data changes on the scale of months; re-run this and commit
 * the diff when it should be fresher. Another state is another file and
 * another call below, not a new mechanism.
 *
 * Pulled a page at a time: `areas` defaults to a **silent** `limit` of 50, and
 * asking for too much in one query is a 502.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { GuidebookRoute, RouteKind, RouteSafety } from '@weatherteam6/types'
import type { SnapshotArea } from '../lib/guidebook/guidebook.js'

const ENDPOINT = 'https://api.openbeta.io/'
const PAGE = 100
/** OpenBeta's "not placed on the wall" value. Kept, it would sort as the far right. */
const NO_POSITION = 999999

type RawClimb = {
  uuid: string
  name: string
  grades: { yds: string | null; french: string | null; vscale: string | null } | null
  type: Partial<Record<'sport' | 'trad' | 'tr' | 'bouldering' | 'aid' | 'ice' | 'mixed', boolean | null>>
  fa: string | null
  safety: string | null
  metadata: { leftRightIndex: number | null; mp_id: string | null }
  content: { description: string | null } | null
}

type RawArea = {
  uuid: string
  areaName: string
  pathTokens: string[]
  ancestors: string[]
  metadata: { lat: number | null; lng: number | null; mp_id: string | null }
  climbs: RawClimb[]
}

const query = (offset: number) => `{
  areas(filter: { path_tokens: { tokens: ["USA", "Minnesota"] } }, limit: ${PAGE}, offset: ${offset}) {
    uuid areaName pathTokens ancestors
    metadata { lat lng mp_id }
    climbs {
      uuid name fa safety
      grades { yds french vscale }
      type { sport trad tr bouldering aid ice mixed }
      metadata { leftRightIndex mp_id }
      content { description }
    }
  }
}`

async function post(body: string): Promise<unknown> {
  let last: unknown = null
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      if (res.ok) return await res.json()
      last = new Error(`HTTP ${res.status}`)
      if (res.status !== 429 && res.status < 500) break
    } catch (err) {
      // 502s and connection resets are routine on this API.
      last = err
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
  }
  throw last instanceof Error ? last : new Error('OpenBeta request failed')
}

/** Placeholders OpenBeta imported as if they were names. */
const NOT_A_NAME = /^\s*(\(?unsure|unknown|\?+|n\/a|none)\b/i

function text(s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  return t === '' ? null : t
}

function toRoute(c: RawClimb): GuidebookRoute {
  const kinds: RouteKind[] = []
  if (c.type.sport === true) kinds.push('sport')
  if (c.type.trad === true) kinds.push('trad')
  if (c.type.tr === true) kinds.push('tr')
  if (c.type.bouldering === true) kinds.push('boulder')
  if (c.type.aid === true) kinds.push('aid')
  if (c.type.ice === true) kinds.push('ice')
  if (c.type.mixed === true) kinds.push('mixed')
  const safety: RouteSafety | null =
    c.safety === 'PG' || c.safety === 'R' || c.safety === 'X' ? c.safety : null
  const lr = c.metadata.leftRightIndex
  const fa = text(c.fa)
  return {
    id: c.uuid,
    name: c.name.trim(),
    yds: text(c.grades?.yds),
    french: text(c.grades?.french),
    vscale: text(c.grades?.vscale),
    kinds,
    first_ascent: fa === null || NOT_A_NAME.test(fa) ? null : fa,
    safety,
    left_right: lr === null || lr < 0 || lr >= NO_POSITION ? null : lr,
    mp_id: text(c.metadata.mp_id),
    description: text(c.content?.description),
  }
}

async function main() {
  const raw: RawArea[] = []
  for (let offset = 0; ; offset += PAGE) {
    const json = (await post(JSON.stringify({ query: query(offset) }))) as {
      data?: { areas?: RawArea[] }
      errors?: unknown
    }
    const page = json.data?.areas
    if (page === undefined) throw new Error(`No areas at offset ${offset}: ${JSON.stringify(json.errors)}`)
    raw.push(...page)
    console.log(`offset ${offset}: ${page.length} areas`)
    if (page.length < PAGE) break
  }

  // **`areas(filter:)` returns every climb's `mp_id` as null** (measured
  // 2026-09-29 on Winter Wall), while `area(uuid:)` returns the real one. So a
  // second, narrow query per area that has climbs fills them in, a few at a time.
  const mpIds = new Map<string, string>()
  const withClimbs = raw.filter((a) => a.climbs.length > 0)
  for (let i = 0; i < withClimbs.length; i += 4) {
    await Promise.all(
      withClimbs.slice(i, i + 4).map(async (a) => {
        const json = (await post(
          JSON.stringify({ query: `{ area(uuid: "${a.uuid}") { climbs { uuid metadata { mp_id } } } }` }),
        )) as { data?: { area?: { climbs: { uuid: string; metadata: { mp_id: string | null } }[] } } }
        for (const c of json.data?.area?.climbs ?? []) {
          if (c.metadata.mp_id !== null) mpIds.set(c.uuid, c.metadata.mp_id)
        }
      }),
    )
  }
  console.log(`Mountain Project ids for ${mpIds.size} climbs`)
  for (const a of raw) for (const c of a.climbs) c.metadata.mp_id = mpIds.get(c.uuid) ?? c.metadata.mp_id

  const areas: SnapshotArea[] = raw
    .map((a) => ({
      id: a.uuid,
      name: a.areaName.trim(),
      path: a.pathTokens.slice(0, -1),
      // `ancestors` runs root first and ends with the area itself.
      parent: a.ancestors.length >= 2 ? (a.ancestors[a.ancestors.length - 2] ?? null) : null,
      lat: a.metadata.lat,
      lon: a.metadata.lng,
      mp_id: text(a.metadata.mp_id),
      routes: a.climbs.map(toRoute).sort((x, y) => x.id.localeCompare(y.id)),
    }))
    // A stable order, so a re-pull diffs as the data's change and not OpenBeta's paging.
    .sort((x, y) => x.id.localeCompare(y.id))

  const routes = areas.reduce((n, a) => n + a.routes.length, 0)
  const date = new Date().toISOString().slice(0, 10)
  const body = [
    '/**',
    ` * Every Minnesota area and route in OpenBeta, pulled ${date} by`,
    ' * `npm run guidebook:pull` — generated, do not edit by hand.',
    ' * CC0 (github.com/OpenBeta/climbing-data); credited because the app names every source.',
    ` * ${areas.length} areas, ${routes} routes.`,
    ' */',
    "import type { SnapshotArea } from './guidebook.js'",
    '',
    `export const MN_GUIDEBOOK_DATE = '${date}'`,
    '',
    'export const MN_GUIDEBOOK: readonly SnapshotArea[] = [',
    ...areas.map((a) => `  ${JSON.stringify(a)},`),
    ']',
    '',
  ].join('\n')

  const out = fileURLToPath(new URL('../lib/guidebook/guidebookMn.ts', import.meta.url))
  writeFileSync(out, body)
  console.log(`wrote ${areas.length} areas, ${routes} routes to ${out}`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
