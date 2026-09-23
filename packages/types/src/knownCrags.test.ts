import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isRockType, type RockType } from './index.js'
import { KNOWN_CRAGS, KNOWN_CRAG_REACH_KM, knownCragBySlug, matchKnownCrag } from './knownCrags.js'

/**
 * Which §7 values each `crag-facts.json` family may become. An entry whose
 * family is not a key here, or whose rock type is not in its family's list, is
 * a lock the research does not back.
 */
const FAMILY_ALLOWS: Record<string, readonly RockType[]> = {
  granite: ['granite', 'granite_weathered'],
  anorthosite: ['anorthosite'],
  syenite: ['syenite_porous'],
  rhyolite: ['rhyolite'],
  basalt_dense: ['basalt_dense'],
  welded_tuff: ['tuff_welded'],
  tuff_nonwelded: ['tuff_nonwelded'],
  volcanic_breccia: ['volcanic_breccia'],
  quartzite: ['quartzite'],
  slate: ['slate'],
  gneiss: ['gneiss_schist'],
  schist: ['gneiss_schist'],
  sandstone: [
    'sandstone_quartz_arenite',
    'sandstone_ferruginous',
    'sandstone_arkose',
    'sandstone_eolian',
    'sandstone_soft',
  ],
  // Spearfish is filed as limestone and is chert-bearing Pahasapa; §7 names it.
  limestone: ['limestone_dense', 'limestone_porous', 'carbonate_cherty'],
  // Red Wing is filed as dolomite and is cherty Oneota; §7 names it.
  dolomite: ['dolomite', 'carbonate_cherty'],
  conglomerate: ['conglomerate'],
}

type FactsCrag = { name: string; rock: { family: string } | null }
const facts: FactsCrag[] = (
  JSON.parse(readFileSync(new URL('../../../.claude/docs/crag-facts.json', import.meta.url), 'utf8')) as {
    crags: FactsCrag[]
  }
).crags

describe('KNOWN_CRAGS — every lock is backed by the research', () => {
  for (const crag of KNOWN_CRAGS) {
    it(`${crag.slug}: cites a crag-facts entry whose family allows ${crag.rock_type}`, () => {
      const entry = facts.find((f) => f.name === crag.facts)
      expect(entry, `"${crag.facts}" is not a crag in crag-facts.json`).toBeDefined()
      const family = entry?.rock?.family ?? ''
      expect(FAMILY_ALLOWS[family], `family "${family}" has no §7 mapping`).toBeDefined()
      expect(FAMILY_ALLOWS[family]).toContain(crag.rock_type)
    })
  }

  it('uses only real rock types, and never a not-recorded one', () => {
    // Locking a crag to "sandstone, not sure which" would stop a user who does
    // know from saying so. Those crags are left out, not locked vaguely.
    for (const crag of KNOWN_CRAGS) {
      expect(isRockType(crag.rock_type)).toBe(true)
      expect(['sandstone', 'limestone', 'basalt', 'unknown']).not.toContain(crag.rock_type)
    }
  })

  it('has unique slugs', () => {
    const slugs = KNOWN_CRAGS.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('has well-formed boxes no larger than the ~30 km cut-off', () => {
    for (const { slug, bbox } of KNOWN_CRAGS) {
      expect(bbox.south, slug).toBeLessThanOrEqual(bbox.north)
      expect(bbox.west, slug).toBeLessThanOrEqual(bbox.east)
      const km = Math.hypot(
        (bbox.north - bbox.south) * 111.32,
        (bbox.east - bbox.west) * 111.32 * Math.cos((bbox.south * Math.PI) / 180),
      )
      expect(km, slug).toBeLessThanOrEqual(31)
    }
  })
})

describe('matchKnownCrag', () => {
  it('matches a point inside a box', () => {
    // Devil's Lake East Bluff, inside the park polygon's box.
    expect(matchKnownCrag(43.418, -89.715)?.slug).toBe('devils-lake')
  })

  /**
   * The owner's saved Red Wing row, 0.6 km south of the Barn Bluff park polygon
   * — the case the reach exists for.
   */
  it('matches a saved point just outside a box', () => {
    expect(matchKnownCrag(44.56247, -92.5338)?.slug).toBe('red-wing')
  })

  /**
   * **The neighbours that decided `KNOWN_CRAG_REACH_KM`.** Each is a crag on a
   * different rock, geocoded from OSM on 2026-09-23, sitting near a known crag's
   * box. A wider reach locks every one of them to the wrong rock.
   */
  it.each([
    ['Dinas Cromlech — rhyolite, 3.2 km from the Dinorwig slate', 53.0918573, -4.0478321],
    ['Golden Cliffs — basalt, 3.5 km from Clear Creek gneiss', 39.7838683, -105.2122773],
    ['Siurana — limestone, near Margalef and the dropped Montsant box', 41.2583112, 0.9325259],
  ])('does not claim a neighbour on different rock: %s', (_label, lat, lon) => {
    expect(matchKnownCrag(lat, lon)).toBeNull()
  })

  /**
   * The price of that reach, pinned so nobody widens it without seeing it:
   * Baraboo the town is 2.6 km north of Devil's Lake State Park and is not it.
   */
  it(`leaves a town ${KNOWN_CRAG_REACH_KM}+ km outside a park unmatched`, () => {
    expect(matchKnownCrag(43.47109, -89.74429)).toBeNull()
  })

  it('prefers the nearer of two crags in reach', () => {
    // Between Cathedral and Whitehorse Ledges, much closer to Whitehorse.
    expect(matchKnownCrag(44.0525, -71.168)?.slug).toBe('whitehorse-ledge')
    expect(matchKnownCrag(44.064, -71.166)?.slug).toBe('cathedral-ledge')
  })

  it('returns null for non-finite input rather than matching anything', () => {
    expect(matchKnownCrag(Number.NaN, -89.7)).toBeNull()
    expect(matchKnownCrag(43.4, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('returns null in open country', () => {
    expect(matchKnownCrag(0, 0)).toBeNull()
  })
})

describe('knownCragBySlug', () => {
  it('finds a stored slug and treats an unknown or absent one as unlocked', () => {
    expect(knownCragBySlug('red-wing')?.rock_type).toBe('carbonate_cherty')
    expect(knownCragBySlug('a-slug-a-newer-build-wrote')).toBeNull()
    expect(knownCragBySlug(null)).toBeNull()
    expect(knownCragBySlug(undefined)).toBeNull()
  })
})
