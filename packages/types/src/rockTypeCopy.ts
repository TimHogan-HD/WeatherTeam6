import type { RockType } from './index.js'

/**
 * How a rock type is written for a person.
 *
 * **This exists because `basalt` stopped being one word.** Two surfaces rendered
 * the raw column — `DryingCard` as "{rock_type} still drying" and
 * `LocationIdentity` as `capitalise(rock_type)` — which was passable while every
 * value was a single lowercase word and produces "basalt_vesicular still drying"
 * and "Basalt_dense" the moment one is not. Same rule as `placeSubtitle` in
 * `geocodeCopy.ts`: one implementation, so the two cannot drift.
 *
 * The parenthetical is the *observable* distinction, not the petrology. A climber
 * is looking at a wall, and "columnar" and "flow top" are what they can see;
 * "0.1-1.0% porosity" is why it matters and belongs in the research document, not
 * on a chip.
 */
const LABELS: Record<RockType, string> = {
  granite: 'Granite',
  granite_weathered: 'Granite (weathered, crumbly)',
  anorthosite: 'Anorthosite',
  syenite_porous: 'Syenite (porous, Hueco-type)',
  rhyolite: 'Rhyolite',
  basalt_dense: 'Basalt (columnar)',
  basalt: 'Basalt',
  basalt_vesicular: 'Basalt (flow top)',
  tuff_welded: 'Tuff (welded)',
  tuff_nonwelded: 'Tuff (non-welded)',
  volcanic_breccia: 'Volcanic breccia',
  quartzite: 'Quartzite',
  slate: 'Slate',
  gneiss_schist: 'Gneiss or schist',
  sandstone: 'Sandstone',
  sandstone_quartz_arenite: 'Sandstone (hard quartz)',
  sandstone_ferruginous: 'Sandstone (iron-cemented)',
  sandstone_arkose: 'Sandstone (gritstone, arkose)',
  sandstone_eolian: 'Sandstone (desert)',
  sandstone_soft: 'Sandstone (soft)',
  limestone: 'Limestone',
  limestone_dense: 'Limestone (dense)',
  limestone_porous: 'Limestone (soft, porous)',
  dolomite: 'Dolomite',
  carbonate_cherty: 'Dolomite or limestone (with chert)',
  conglomerate: 'Conglomerate',
  unknown: 'Unknown',
}

/**
 * The display name for a rock type.
 *
 * Falls back to the raw value rather than to a dash or an empty string: an
 * unrecognised value here means a column holds something this build does not
 * know, and showing it is how that gets noticed. A row written by a newer deploy
 * degrades to "basalt_something" rather than vanishing.
 */
export function rockTypeLabel(rockType: string): string {
  return LABELS[rockType as RockType] ?? rockType
}

/**
 * The same label, lowercased for mid-sentence use — "basalt (flow top) still
 * drying".
 *
 * Not `toLowerCase()` at each call site, because that is the kind of thing one
 * caller does and the other forgets.
 */
export function rockTypeLabelInline(rockType: string): string {
  return rockTypeLabel(rockType).toLowerCase()
}

export type RockTypeGroup = {
  readonly family: string
  readonly options: readonly { readonly value: RockType; readonly label: string }[]
}

/**
 * **The picker, grouped by family, and every rock type appears in exactly one
 * group** — `rockTypeCopy.test.ts` asserts the partition against `ROCK_TYPES`,
 * so a value added there without a home here fails rather than quietly never
 * being offered.
 *
 * Twenty-seven values do not fit as chips, so the picker is a native `<select>`
 * with these as its `<optgroup>`s.
 *
 * **The "kind not recorded" values read as an answer, not as a rock.** Inside
 * the Sandstone group, `sandstone` is *"Sandstone, not sure which"*: it takes
 * the slowest window in its family (`dryingModel.ts`), and someone who does not
 * know which sandstone they are on should be choosing caution knowingly.
 * `unknown` is *"Not sure"* for the same reason — "Unknown" beside a list of
 * rock names reads like a failed lookup rather than something a user may say.
 */
export const ROCK_TYPE_GROUPS: readonly RockTypeGroup[] = [
  {
    family: 'Granite and plutonic',
    options: [
      { value: 'granite', label: LABELS.granite },
      { value: 'granite_weathered', label: LABELS.granite_weathered },
      { value: 'anorthosite', label: LABELS.anorthosite },
      { value: 'syenite_porous', label: LABELS.syenite_porous },
    ],
  },
  {
    family: 'Volcanic',
    options: [
      { value: 'basalt', label: 'Basalt, not sure which' },
      { value: 'basalt_dense', label: LABELS.basalt_dense },
      { value: 'basalt_vesicular', label: LABELS.basalt_vesicular },
      { value: 'rhyolite', label: LABELS.rhyolite },
      { value: 'tuff_welded', label: LABELS.tuff_welded },
      { value: 'tuff_nonwelded', label: LABELS.tuff_nonwelded },
      { value: 'volcanic_breccia', label: LABELS.volcanic_breccia },
    ],
  },
  {
    family: 'Metamorphic',
    options: [
      { value: 'quartzite', label: LABELS.quartzite },
      { value: 'slate', label: LABELS.slate },
      { value: 'gneiss_schist', label: LABELS.gneiss_schist },
    ],
  },
  {
    family: 'Sandstone',
    options: [
      { value: 'sandstone', label: 'Sandstone, not sure which' },
      { value: 'sandstone_quartz_arenite', label: LABELS.sandstone_quartz_arenite },
      { value: 'sandstone_ferruginous', label: LABELS.sandstone_ferruginous },
      { value: 'sandstone_arkose', label: LABELS.sandstone_arkose },
      { value: 'sandstone_eolian', label: LABELS.sandstone_eolian },
      { value: 'sandstone_soft', label: LABELS.sandstone_soft },
    ],
  },
  {
    family: 'Limestone and dolomite',
    options: [
      { value: 'limestone', label: 'Limestone, not sure which' },
      { value: 'limestone_dense', label: LABELS.limestone_dense },
      { value: 'limestone_porous', label: LABELS.limestone_porous },
      { value: 'dolomite', label: LABELS.dolomite },
      { value: 'carbonate_cherty', label: LABELS.carbonate_cherty },
    ],
  },
  {
    family: 'Other',
    options: [
      { value: 'conglomerate', label: LABELS.conglomerate },
      { value: 'unknown', label: 'Not sure' },
    ],
  },
]
