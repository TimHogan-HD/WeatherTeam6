import type { RockType } from './index.js'

/**
 * **Rock type by OpenBeta area** (owner, 2026-10-19: "if sub areas have
 * different rock types then we adjust for the sub areas"). An area here locks
 * its rock for itself and everything under it; the nearest listed ancestor
 * wins, so a sub-area entry overrides its parent's. Where a parent mixes rocks
 * (Duluth, Grand Junction, Estes Park, Fort Collins) only its one-rock
 * sub-areas are listed, and the rest keep the picker.
 *
 * `KNOWN_CRAGS`' boxes still win where they match: they came first and carry
 * crag-facts' citations. These are well-known regional geology, each a
 * judgement call. A reader who knows better uses "Wrong rock type?" on the
 * save screen, which files app feedback the owner reads on Profile.
 */
export type AreaRock = {
  readonly area_id: string
  readonly name: string
  readonly rock_type: RockType
}

export const AREA_ROCK: readonly AreaRock[] = [
  // ── Utah ────────────────────────────────────────────────────────────────────
  { area_id: 'f166e672-4a52-56d3-94f1-14c876feb670', name: 'Indian Creek', rock_type: 'sandstone_eolian' }, // Wingate
  // ── Minnesota ───────────────────────────────────────────────────────────────
  { area_id: '9738032f-3543-5778-80de-72115d6df5e7', name: "Ely's Peak", rock_type: 'basalt' },
  { area_id: '0e733a12-f01e-573a-8643-30f0d6c6b432', name: "Jeff's World", rock_type: 'granite' }, // Vermilion batholith
  { area_id: 'a8231cba-a80d-562e-9198-14d338049463', name: 'Winona, Sugar Loaf', rock_type: 'dolomite' }, // Oneota
  { area_id: '37b77a60-dd63-59cb-a83a-43aebaf7b3be', name: 'Banning State Park', rock_type: 'sandstone_quartz_arenite' }, // Hinckley
  { area_id: '752c3abe-ceb7-5b6a-9ea9-8dfffcfc9ea3', name: 'Quarry Park (St. Cloud)', rock_type: 'granite' },
  // ── Colorado ────────────────────────────────────────────────────────────────
  { area_id: '3008c0fb-0ce5-525b-b50f-6155887d0597', name: 'South Platte', rock_type: 'granite' }, // Pikes Peak granite
  { area_id: 'd4b25844-b511-53bc-895e-67a6421d4ec4', name: 'Buena Vista', rock_type: 'granite' }, // Mount Princeton batholith
  { area_id: '9ef89b9d-db55-57cb-b9d3-dac26aa710a4', name: 'Lumpy Ridge', rock_type: 'granite' }, // Silver Plume granite
  { area_id: 'e519a674-a620-509c-9e86-a246f84a8e40', name: 'Boulder Canyon', rock_type: 'granite' }, // Boulder Creek granodiorite
  { area_id: '8071adfd-baa5-506e-9150-589f9e9bb0ae', name: 'Flagstaff', rock_type: 'sandstone_arkose' }, // Fountain
  { area_id: '054defef-ef8b-511a-8dd3-3f5a56ac32eb', name: 'North Table Mountain / Golden Cliffs', rock_type: 'basalt' },
  { area_id: 'ad22b47b-28bf-545c-bb26-55da9f0f1805', name: 'Colorado National Monument', rock_type: 'sandstone_eolian' }, // Wingate
  { area_id: '6739ddfc-0780-59ce-8f38-1afbf957a9a2', name: 'North Cheyenne Canyon', rock_type: 'granite' }, // Pikes Peak granite
  { area_id: '7cd236cb-81e4-5703-b5e4-feba063bf509', name: 'Hartman Rocks', rock_type: 'granite' },
  { area_id: 'dc27c11e-06d3-52cb-bad8-b773996ce911', name: 'Black Canyon of the Gunnison', rock_type: 'gneiss_schist' },
  { area_id: '22dac198-10d8-5ebf-94d5-6e503a0753a0', name: 'Rifle Mountain Park', rock_type: 'limestone_dense' }, // Leadville
]

/** The listed area nearest `areaId` going up, given a way to step to each parent. */
export function areaRockFor(areaId: string, parentOf: (id: string) => string | null): AreaRock | null {
  for (let id: string | null = areaId; id !== null; id = parentOf(id)) {
    const hit = AREA_ROCK.find((a) => a.area_id === id)
    if (hit !== undefined) return hit
  }
  return null
}
