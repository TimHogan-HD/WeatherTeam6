import type { RockType } from '@weatherteam6/types'

/**
 * Re-exported because this module's own copy of the union was the original
 * source of the drift `ROCK_TYPES` now prevents, and several callers import
 * `RockType` from here. It is an alias now, not a second definition.
 */
export type { RockType }

/**
 * **`basalt` is three values, because one number cannot describe the family.**
 * Porosity across basalt spans **0.1-1.0% for dense columnar rock and 30-50% for
 * a vesicular flow top** (`.claude/docs/rock-drying-research.md` §3) — the widest
 * spread of any family in the enum, and wider than the gap between granite and
 * sandstone. A single `basalt` row gave Devils Tower and a scoriaceous flow top
 * the same drying window and had to be wrong for one of them.
 *
 * `basalt` is kept, and it does **not** mean "average basalt". It means the kind
 * was never recorded, and it is what the picker offers someone who does not
 * know. An unrecorded kind takes the slower of the two, so it reads as caution
 * rather than as a guess. (Split 2026-09-16, keeping 12/48 so no existing row
 * moved.)
 *
 * **The windows are `rock-drying-research.md` §7's table, taken whole — owner
 * decision 2026-09-23.** Hours for a moderate storm on a vertical wall, before
 * the angle modifier. The confidence marker on each row is §7's own: [M]
 * measured porosity behind the *ordering*, [C] community convention, [I]
 * inference. **No row is a measured drying time** — §8 records that none exists
 * for any climbing rock — so these order the rocks defensibly and put a number
 * on each that nobody has checked.
 *
 * **The not-recorded values take the slowest window in their family**, the rule
 * `basalt` already followed: `sandstone` is `sandstone_soft`'s 48/120,
 * `limestone` is `limestone_porous`'s 24/72, `basalt` is `basalt_vesicular`'s
 * 12/48. And **`unknown` is the most conservative row in the table** (§6.2):
 * it was 24/48, which declared an unlabelled crag dry a full day before the
 * same wall labelled sandstone.
 *
 * Seepage is not in these numbers and cannot be (§2.3, issue #138). A dense
 * limestone's 18 hours is its *surface*; a seeping one is wet for weeks.
 */
export const MIN_HOURS: Record<RockType, number> = {
  slate: 1, // [C] no pore space; fastest in community rankings
  granite: 1, // [M] fresh plutonic, 0.5-1.5% porosity
  anorthosite: 1, // [I] dense plutonic
  quartzite: 1, // [M] near-zero matrix porosity
  rhyolite: 2, // [I] fine-grained, low porosity
  basalt_dense: 2, // [M] 0.1-1.0% porosity
  gneiss_schist: 2, // [M/I] foliation drainage
  granite_weathered: 3, // [I] grus rind retains water
  tuff_welded: 4, // [C] near-granitic
  limestone_dense: 4, // [M/C] surface only; seepage separate
  dolomite: 6, // [M/I] pocket water
  carbonate_cherty: 6, // [I] two materials in one wall
  sandstone_quartz_arenite: 24, // [C] Robinson Park, Fontainebleau: 24-48 h local rule (owner 2026-09-29)
  syenite_porous: 24, // [C] Hueco Tanks: no climbing within ~24 h of rain
  basalt: 12, // not recorded → basalt_vesicular
  basalt_vesicular: 12, // [M] 30-50% porosity
  sandstone_ferruginous: 12, // [I] Corbin-type
  sandstone_arkose: 12, // [C] Fountain, Millstone Grit
  volcanic_breccia: 48, // [C] Pinnacles: brittle for days after rain (climbers; owner 2026-09-29)
  limestone: 24, // not recorded → limestone_porous
  limestone_porous: 24, // [S/C] up to 12% absorption
  conglomerate: 24, // [I] matrix-controlled, invisible from the surface
  tuff_nonwelded: 36, // [M] 38-60% porosity
  sandstone_eolian: 36, // [M/C] calcite/clay cement
  sandstone: 48, // not recorded → sandstone_soft
  sandstone_soft: 48, // [C] Elbsandstein / Southern Sandstone class
  unknown: 48, // the most conservative row, §6.2
}

export const MAX_HOURS: Record<RockType, number> = {
  slate: 4,
  granite: 6,
  anorthosite: 6,
  quartzite: 6,
  rhyolite: 8,
  basalt_dense: 8,
  gneiss_schist: 12,
  granite_weathered: 12,
  tuff_welded: 16,
  limestone_dense: 18,
  dolomite: 24,
  carbonate_cherty: 24,
  sandstone_quartz_arenite: 48,
  syenite_porous: 48,
  basalt: 48,
  basalt_vesicular: 48,
  sandstone_ferruginous: 48,
  sandstone_arkose: 48,
  volcanic_breccia: 120,
  limestone: 72,
  limestone_porous: 72,
  conglomerate: 72,
  tuff_nonwelded: 96,
  sandstone_eolian: 96,
  sandstone: 120,
  sandstone_soft: 120,
  unknown: 120,
}
