/**
 * Regenerates one state's `src/lib/weather/climbingAreas<Xx>.ts` — every area
 * under USA > <State> in OpenBeta with at least one climb and a coordinate,
 * most climbs first — for the `/add` search.
 *
 *   npm run climbing:pull --workspace=apps/api -- Colorado CO
 *   npm run climbing:pull --workspace=apps/api -- Utah UT "Southeast Utah/Indian Creek"
 *
 * The optional third argument pulls one area of the state instead of all of
 * it, the path below the state split on `/`; that area becomes the snapshot's
 * only top-level entry (owner, 2026-10-19: Indian Creek, not all of Utah).
 *
 * A snapshot and not a live call for the reason in `pullGuidebook.ts`: the API
 * is too slow and too flaky for type-ahead. A new state is a new file, then one
 * line in `climbingAreas.ts`'s `STATES`.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ClimbingArea } from '../lib/weather/climbingAreas.js'
import { REPINNED_AREAS } from '../lib/weather/climbingAreaRepins.js'

const ENDPOINT = 'https://api.openbeta.io/'
/** `areas` defaults to a **silent** `limit` of 50; asking for too much in one query is a 502. */
const PAGE = 200

type RawArea = {
  uuid: string
  area_name: string
  pathTokens: string[]
  /** Ids from USA down to the area itself, matching `pathTokens` one for one. */
  ancestors: string[]
  totalClimbs: number | null
  metadata: { lat: number | null; lng: number | null }
}

const query = (tokens: readonly string[], offset: number) => `{
  areas(filter: { path_tokens: { tokens: ${JSON.stringify(tokens)} } }, limit: ${PAGE}, offset: ${offset}) {
    uuid area_name pathTokens ancestors totalClimbs
    metadata { lat lng }
  }
}`

async function post(body: string): Promise<unknown> {
  let last: unknown = null
  for (let attempt = 0; attempt < 6; attempt++) {
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

async function main() {
  const [state, abbr, only] = process.argv.slice(2)
  if (state === undefined || abbr === undefined || !/^[A-Z]{2}$/.test(abbr)) {
    throw new Error('usage: climbing:pull -- <State name> <two-letter code> [area/path], e.g. Colorado CO')
  }
  const tokens = ['USA', state, ...(only === undefined ? [] : only.split('/').map((t) => t.trim()))]
  const scope = tokens.join(' > ')
  // The path length of a top-level entry: an area directly under the state, or the pulled area itself.
  const topLength = only === undefined ? 3 : tokens.length

  const raw: RawArea[] = []
  for (let offset = 0; ; offset += PAGE) {
    const json = (await post(JSON.stringify({ query: query(tokens, offset) }))) as {
      data?: { areas?: RawArea[] }
      errors?: unknown
    }
    const page = json.data?.areas
    if (page === undefined) throw new Error(`No areas at offset ${offset}: ${JSON.stringify(json.errors)}`)
    raw.push(...page)
    console.log(`offset ${offset}: ${page.length} areas`)
    if (page.length < PAGE) break
  }
  if (raw.length === 0) throw new Error(`OpenBeta has no areas under ${scope} — check the spelling`)

  const seen = new Set<string>()
  const areas: ClimbingArea[] = raw
    .filter((a) => {
      if (seen.has(a.uuid)) return false
      seen.add(a.uuid)
      // pathTokens runs USA, state, ..., the area itself; the state is not an area to search.
      return (
        a.pathTokens.length >= topLength &&
        (a.totalClimbs ?? 0) > 0 &&
        a.metadata.lat !== null &&
        a.metadata.lng !== null
      )
    })
    .map((a) => ({
      uuid: a.uuid,
      name: a.area_name.trim(),
      // A top-level entry's parent, the state or an area above the pull, is recorded as null.
      parent: a.pathTokens.length > topLength ? (a.pathTokens[a.pathTokens.length - 2] ?? null) : null,
      parent_id: a.pathTokens.length > topLength ? (a.ancestors[a.ancestors.length - 2] ?? null) : null,
      climbs: a.totalClimbs ?? 0,
      lat: REPINNED_AREAS.get(a.uuid)?.lat ?? Math.round(a.metadata.lat! * 1e5) / 1e5,
      lon: REPINNED_AREAS.get(a.uuid)?.lon ?? Math.round(a.metadata.lng! * 1e5) / 1e5,
    }))
    // Most climbs first, then id, so a re-pull diffs as the data's change and not OpenBeta's paging.
    .sort((x, y) => y.climbs - x.climbs || x.uuid.localeCompare(y.uuid))

  const pascal = abbr[0] + abbr[1]!.toLowerCase()
  const date = new Date().toISOString().slice(0, 10)
  const body = [
    '/**',
    ` * ${state} climbing areas from OpenBeta, pulled ${date} by`,
    ` * \`npm run climbing:pull -- ${process.argv.slice(2).map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}\` — generated, do not edit by hand.`,
    ' * CC0 (github.com/OpenBeta/climbing-data); credited because the app names every source.',
    ` * Every area ${only === undefined ? 'under' : 'at or under'} ${scope} with at least one climb and a coordinate, most climbs first.`,
    ' */',
    "import type { ClimbingArea } from './climbingAreas.js'",
    '',
    `export const ${abbr}_CLIMBING_AREAS: readonly ClimbingArea[] = [`,
    ...areas.map((a) => `  ${JSON.stringify(a)},`),
    ']',
    '',
  ].join('\n')

  const out = fileURLToPath(new URL(`../lib/weather/climbingAreas${pascal}.ts`, import.meta.url))
  writeFileSync(out, body)
  console.log(`wrote ${areas.length} of ${raw.length} areas to ${out}`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
