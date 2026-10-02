/**
 * Regenerates one state's `src/lib/weather/climbingAreas<Xx>.ts` — every area
 * under USA > <State> in OpenBeta with at least one climb and a coordinate,
 * most climbs first — for the `/add` search.
 *
 *   npm run climbing:pull --workspace=apps/api -- Colorado CO
 *
 * A snapshot and not a live call for the reason in `pullGuidebook.ts`: the API
 * is too slow and too flaky for type-ahead. A new state is a new file, then one
 * line in `climbingAreas.ts`'s `STATES`.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ClimbingArea } from '../lib/weather/climbingAreas.js'

const ENDPOINT = 'https://api.openbeta.io/'
/** `areas` defaults to a **silent** `limit` of 50; asking for too much in one query is a 502. */
const PAGE = 200

type RawArea = {
  uuid: string
  area_name: string
  pathTokens: string[]
  totalClimbs: number | null
  metadata: { lat: number | null; lng: number | null }
}

const query = (state: string, offset: number) => `{
  areas(filter: { path_tokens: { tokens: ["USA", ${JSON.stringify(state)}] } }, limit: ${PAGE}, offset: ${offset}) {
    uuid area_name pathTokens totalClimbs
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
  const [state, abbr] = process.argv.slice(2)
  if (state === undefined || abbr === undefined || !/^[A-Z]{2}$/.test(abbr)) {
    throw new Error('usage: climbing:pull -- <State name> <two-letter code>, e.g. Colorado CO')
  }

  const raw: RawArea[] = []
  for (let offset = 0; ; offset += PAGE) {
    const json = (await post(JSON.stringify({ query: query(state, offset) }))) as {
      data?: { areas?: RawArea[] }
      errors?: unknown
    }
    const page = json.data?.areas
    if (page === undefined) throw new Error(`No areas at offset ${offset}: ${JSON.stringify(json.errors)}`)
    raw.push(...page)
    console.log(`offset ${offset}: ${page.length} areas`)
    if (page.length < PAGE) break
  }
  if (raw.length === 0) throw new Error(`OpenBeta has no areas under USA > ${state} — check the spelling`)

  const seen = new Set<string>()
  const areas: ClimbingArea[] = raw
    .filter((a) => {
      if (seen.has(a.uuid)) return false
      seen.add(a.uuid)
      // pathTokens runs USA, state, ..., the area itself; the state is not an area to search.
      return a.pathTokens.length > 2 && (a.totalClimbs ?? 0) > 0 && a.metadata.lat !== null && a.metadata.lng !== null
    })
    .map((a) => ({
      uuid: a.uuid,
      name: a.area_name.trim(),
      // pathTokens runs USA, state, ..., the area itself.
      parent: a.pathTokens.length > 3 ? (a.pathTokens[a.pathTokens.length - 2] ?? null) : null,
      climbs: a.totalClimbs ?? 0,
      lat: Math.round(a.metadata.lat! * 1e5) / 1e5,
      lon: Math.round(a.metadata.lng! * 1e5) / 1e5,
    }))
    // Most climbs first, then id, so a re-pull diffs as the data's change and not OpenBeta's paging.
    .sort((x, y) => y.climbs - x.climbs || x.uuid.localeCompare(y.uuid))

  const pascal = abbr[0] + abbr[1]!.toLowerCase()
  const date = new Date().toISOString().slice(0, 10)
  const body = [
    '/**',
    ` * ${state} climbing areas from OpenBeta, pulled ${date} by`,
    ` * \`npm run climbing:pull -- ${state} ${abbr}\` — generated, do not edit by hand.`,
    ' * CC0 (github.com/OpenBeta/climbing-data); credited because the app names every source.',
    ` * Every area under USA > ${state} with at least one climb and a coordinate, most climbs first.`,
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
