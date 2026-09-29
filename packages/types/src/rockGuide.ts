import type { RockType } from './index.js'

/**
 * The Rock tab's field guide: what each rock is, how it climbs, what rain and
 * sun do to it, and how to look after it.
 *
 * **General knowledge about a rock type, not a reading of this crag.** Nothing
 * here is measured at the location; the tab says so. The claims follow
 * `.claude/docs/rock-drying-research.md` (§2.4 wet strength, §3 porosity, §3.1
 * friction, §4 per-family notes, §10 corrections) and carry no figure that §10
 * could not source.
 *
 * **`dries` is a band of the drying table, not a copy of it.** The hours live
 * only in `dryingModel.ts` (`MIN_HOURS`/`MAX_HOURS`); `dryingModel.test.ts`
 * holds every row here to the band its `MAX_HOURS` falls in, so the words on
 * this tab cannot drift from the clock the score runs on.
 *
 * **`unknown` has no guide.** It means nobody recorded the rock, and a profile
 * for it would describe a rock that may not be there.
 */

/** How long rain keeps it off-limits: `hours` ≤ 12 h, `day` ≤ 48 h, `days` beyond. */
export type DryingPace = 'hours' | 'day' | 'days'

/** What water does to its strength (§2.4, §3's wet-strength column). */
export type WetStrength = 'holds' | 'softens' | 'fragile'

/** The pattern the tab draws for it. */
export type RockTexture =
  | 'crystalline'
  | 'bedded'
  | 'columnar'
  | 'vesicular'
  | 'banded'
  | 'sheeted'
  | 'pocketed'
  | 'clastic'

/** Its colour family — the key into `rockSwatchV2` in `packages/design`. */
export type RockSwatch =
  | 'granite'
  | 'pale'
  | 'rhyolite'
  | 'basalt'
  | 'tuff'
  | 'quartzite'
  | 'slate'
  | 'gneiss'
  | 'sandstoneBuff'
  | 'sandstoneRed'
  | 'grit'
  | 'limestone'
  | 'conglomerate'

export type RockGuide = {
  swatch: RockSwatch
  texture: RockTexture
  /** One line under the name. */
  tagline: string
  dries: DryingPace
  whenWet: WetStrength
  /** The holds and features it is known for, as chips. */
  styles: readonly string[]
  rain: string
  sun: string
  funFact: string
  /** Do. */
  care: readonly string[]
  /** Don't. */
  avoid: readonly string[]
}

const NO_WIRE = 'Scrub with a wire brush — use nylon or bristle'

const GUIDES: Record<Exclude<RockType, 'unknown'>, RockGuide> = {
  granite: {
    swatch: 'granite',
    texture: 'crystalline',
    tagline: 'Coarse crystals locked into a sealed, tough surface.',
    dries: 'hours',
    whenWet: 'holds',
    styles: ['Cracks', 'Slab', 'Friction', 'Edges'],
    rain: 'Sheds water fast and loses no strength wet — but rubber won’t stick until it’s dry.',
    sun: 'Friction fades as it warms. Chase shade in summer and sun in winter.',
    funFact: 'Only about 1% of granite is pore space, so rain mostly sits on the surface — one reason it dries so quickly.',
    care: ['Brush off chalk and tick marks as you leave', 'Let wet streaks in cracks drain before trusting them'],
    avoid: [NO_WIRE],
  },
  granite_weathered: {
    swatch: 'granite',
    texture: 'crystalline',
    tagline: 'Granite with a gritty, crumbling rind.',
    dries: 'hours',
    whenWet: 'softens',
    styles: ['Slab', 'Friction', 'Slopers'],
    rain: 'The gritty rind holds water after the face looks dry.',
    sun: 'A dry, cool day gives the best friction on the grit.',
    funFact: 'The loose sand at the base is “grus” — granite coming apart grain by grain as its feldspar weathers to clay.',
    care: ['Test crystals and flakes before weighting them'],
    avoid: ['Pulling hard on wet crystals — they pop off', NO_WIRE],
  },
  anorthosite: {
    swatch: 'pale',
    texture: 'crystalline',
    tagline: 'Dense, pale and abrasive.',
    dries: 'hours',
    whenWet: 'holds',
    styles: ['Edges', 'Crimps', 'Friction'],
    rain: 'Dense rock that sheds rain within hours.',
    sun: 'Pale rock reflects sunlight, so it stays cooler than dark rock beside it.',
    funFact: 'Anorthosite is almost all one mineral, plagioclase feldspar — the same rock as the Moon’s pale highlands.',
    care: ['Tape up — it’s hard on skin'],
    avoid: [NO_WIRE],
  },
  syenite_porous: {
    swatch: 'granite',
    texture: 'pocketed',
    tagline: 'A porous igneous rock riddled with huecos.',
    dries: 'day',
    whenWet: 'softens',
    styles: ['Huecos', 'Pockets', 'Roofs', 'Slopers'],
    rain: 'Huecos hold water for days, and wet holds snap.',
    sun: 'Desert sun dries the face quickly; the pockets lag behind.',
    funFact: 'It breaks the igneous rule: most rock born from magma dries fast, and this kind drinks water.',
    care: ['Wait for the pockets to dry, not just the face'],
    avoid: ['Climbing after rain — a snapped hold is gone for good'],
  },
  rhyolite: {
    swatch: 'rhyolite',
    texture: 'crystalline',
    tagline: 'Fine-grained volcanic rock, dense and fast to dry.',
    dries: 'hours',
    whenWet: 'holds',
    styles: ['Edges', 'Crimps', 'Cracks'],
    rain: 'Low porosity — sheds rain within hours.',
    sun: 'Darker faces soak up sun and warm quickly.',
    funFact: 'Rhyolite is granite’s volcanic twin: the same melt, cooled too fast to grow big crystals.',
    care: ['Check blocks and flakes — fractured volcanic rock can be loose'],
    avoid: [NO_WIRE],
  },
  basalt_dense: {
    swatch: 'basalt',
    texture: 'columnar',
    tagline: 'Dark columns of dense lava rock.',
    dries: 'hours',
    whenWet: 'holds',
    styles: ['Cracks', 'Stemming', 'Corners', 'Arêtes'],
    rain: 'Almost no pore space — dries in hours and loses no strength.',
    sun: 'Dark rock soaks up sun, so a sunny face gets hot fast.',
    funFact: 'The columns form as a thick lava flow cools and shrinks, cracking into mostly six-sided pillars.',
    care: ['Check column tops — they can be loose blocks'],
    avoid: [NO_WIRE],
  },
  basalt: {
    swatch: 'basalt',
    texture: 'vesicular',
    tagline: 'Lava rock — dense columns or bubbly flow tops.',
    dries: 'day',
    whenWet: 'softens',
    styles: ['Cracks', 'Edges', 'Pockets'],
    rain: 'The kind isn’t recorded, so we time it like the slow, bubbly kind.',
    sun: 'Dark rock soaks up sun, so a sunny face gets hot fast.',
    funFact: 'Dense column basalt and bubbly flow-top basalt can come from one eruption and dry at very different speeds.',
    care: ['Check blocks and bubble edges before weighting them'],
    avoid: [NO_WIRE],
  },
  basalt_vesicular: {
    swatch: 'basalt',
    texture: 'vesicular',
    tagline: 'Bubbly lava rock full of gas holes.',
    dries: 'day',
    whenWet: 'softens',
    styles: ['Pockets', 'Jugs', 'Edges'],
    rain: 'The gas holes trap water and take a day or more to empty.',
    sun: 'Dark rock soaks up sun, so a sunny face gets hot fast.',
    funFact: 'Each hole is a frozen gas bubble — the lava set before the gas could escape.',
    care: ['Tape up — bubble edges are sharp'],
    avoid: ['Cranking on thin bubble walls — they snap'],
  },
  tuff_welded: {
    swatch: 'tuff',
    texture: 'pocketed',
    tagline: 'Volcanic ash, fused solid by its own heat.',
    dries: 'day',
    whenWet: 'holds',
    styles: ['Edges', 'Pockets', 'Knobs'],
    rain: 'Behaves close to granite — dries within a day.',
    sun: 'Shade and a breeze beat full sun for friction.',
    funFact: 'Tuff is volcanic ash. When it lands hot enough the grains fuse into solid rock — that’s “welded”.',
    care: ['Test knobs before pulling on them'],
    avoid: [NO_WIRE],
  },
  tuff_nonwelded: {
    swatch: 'tuff',
    texture: 'pocketed',
    tagline: 'Soft, porous volcanic ash rock.',
    dries: 'days',
    whenWet: 'fragile',
    styles: ['Pockets', 'Huecos', 'Slopers'],
    rain: 'Soaks up rain and weakens for days.',
    sun: 'Sun dries the face first; the core stays wet long after.',
    funFact: 'Non-welded tuff can hold more water than most sandstone — more pore than rock in places.',
    care: ['Give it days after rain, not hours'],
    avoid: ['Climbing it damp — holds crumble', NO_WIRE],
  },
  volcanic_breccia: {
    swatch: 'tuff',
    texture: 'clastic',
    tagline: 'Angular chunks of rock set in a finer cement.',
    dries: 'day',
    whenWet: 'softens',
    styles: ['Knobs', 'Edges', 'Pockets'],
    rain: 'The cement between the chunks softens when wet.',
    sun: 'Shade and a breeze beat full sun for friction.',
    funFact: '“Breccia” is Italian for rubble — each chunk was shattered in an eruption and glued back together.',
    care: ['Test every knob before you trust it'],
    avoid: ['Pulling on knobs while the rock is wet'],
  },
  quartzite: {
    swatch: 'quartzite',
    texture: 'bedded',
    tagline: 'Sandstone baked into glassy, very hard rock.',
    dries: 'hours',
    whenWet: 'holds',
    styles: ['Edges', 'Crimps', 'Cracks', 'Roofs'],
    rain: 'Near-zero pore space — sheds water fast and never weakens.',
    sun: 'Slick once it’s warm or humid. Go on cool, dry days.',
    funFact: 'Heat and pressure fused the sand grains so completely that quartzite breaks through them, not around them.',
    care: ['Keep holds clean — polish shows fast'],
    avoid: ['Climbing it humid and expecting friction'],
  },
  slate: {
    swatch: 'slate',
    texture: 'sheeted',
    tagline: 'Old seafloor mud, pressed into thin sheets.',
    dries: 'hours',
    whenWet: 'holds',
    styles: ['Edges', 'Slab', 'Crimps'],
    rain: 'No pore space to fill — one of the fastest rocks to dry.',
    sun: 'Dark slate heats quickly in the sun.',
    funFact: 'The same splitting that makes roof tiles makes the edges — and slate is famous for having almost no friction.',
    care: ['Check thin edges — they can snap'],
    avoid: ['Pulling outward on loose sheets'],
  },
  gneiss_schist: {
    swatch: 'gneiss',
    texture: 'banded',
    tagline: 'Banded rock, squeezed and folded deep underground.',
    dries: 'hours',
    whenWet: 'holds',
    styles: ['Edges', 'Crimps', 'Flakes'],
    rain: 'The face dries fast, but water seeps along the bands for longer.',
    sun: 'Friction is best on cool days; seeps dry slowest in shade.',
    funFact: 'The stripes are minerals that separated into layers under heat and pressure miles down.',
    care: ['Watch for seep lines along the bands'],
    avoid: ['Pulling outward on flakes that follow the layers'],
  },
  sandstone: {
    swatch: 'sandstoneBuff',
    texture: 'bedded',
    tagline: 'Sand grains cemented into stone.',
    dries: 'days',
    whenWet: 'fragile',
    styles: ['Slopers', 'Pockets', 'Edges', 'Cracks'],
    rain: 'The kind isn’t recorded, so we time it like the softest sandstone.',
    sun: 'The surface dries first — the inside takes far longer.',
    funFact: 'The glue between the grains — silica, iron or calcite — decides how strong a sandstone is when wet.',
    care: ['Dig into the sand at the base: damp sand means damp rock'],
    avoid: ['Climbing it damp — holds break and never grow back', NO_WIRE],
  },
  // Softens, not holds (owner, 2026-09-29): Hinckley Sandstone at Robinson Park
  // is ~96% quartz and still breaks after rain, and the local ethic is to stay
  // off it. The ~0% wet strength loss in the research is one lab result for
  // clean, clay-free rock — the cement decides, and it is not visible.
  sandstone_quartz_arenite: {
    swatch: 'sandstoneBuff',
    texture: 'bedded',
    tagline: 'Quartz sand grains, cemented together.',
    dries: 'day',
    whenWet: 'softens',
    styles: ['Edges', 'Slopers', 'Friction'],
    rain: 'Tough quartz grains, but the cement between them weakens when wet. Let it dry through.',
    sun: 'Grippy when cool; slopers go greasy in the heat.',
    funFact: 'Nearly all quartz, yet it can still break when wet — the glue between the grains matters more than the grains.',
    care: ['Dig into the sand at the base: damp sand means damp rock'],
    avoid: ['Climbing it damp — holds break and never grow back', NO_WIRE],
  },
  sandstone_ferruginous: {
    swatch: 'sandstoneRed',
    texture: 'bedded',
    tagline: 'Iron-cemented sandstone with a hard outer skin.',
    dries: 'day',
    whenWet: 'softens',
    styles: ['Crimps', 'Edges', 'Pockets', 'Roofs'],
    rain: 'The hard skin is thin, and the rock behind it stays damp longer.',
    sun: 'Iron-dark faces warm fast in direct sun.',
    funFact: 'Iron hardened the surface into a “case” — break through it and the rock behind is far softer.',
    care: ['Stay off it until it’s dry'],
    avoid: ['Brushing hard — it wears through the case', NO_WIRE],
  },
  sandstone_arkose: {
    swatch: 'grit',
    texture: 'clastic',
    tagline: 'Coarse, pebbly grit with pink feldspar grains.',
    dries: 'day',
    whenWet: 'softens',
    styles: ['Slopers', 'Friction', 'Arêtes', 'Cracks'],
    rain: 'Slick and prone to seeps when wet, though tougher than desert sandstone.',
    sun: 'Best on cold, breezy days — friction drops off fast in warmth.',
    funFact: 'The pink grains are feldspar: grit is granite worn down to sand and cemented back together.',
    care: ['Save the slopers for a cold day'],
    avoid: ['Climbing it damp', NO_WIRE],
  },
  sandstone_eolian: {
    swatch: 'sandstoneRed',
    texture: 'bedded',
    tagline: 'Ancient desert dunes, turned to stone.',
    dries: 'days',
    whenWet: 'fragile',
    styles: ['Cracks', 'Splitters', 'Slopers'],
    rain: 'Soaks up rain and loses much of its strength until it’s dry right through.',
    sun: 'Sun dries the surface fast; the inside takes far longer.',
    funFact: 'The sweeping lines are the faces of old sand dunes — the wind’s layers, frozen in rock.',
    care: ['Dig into the sand at the base: damp sand means damp rock'],
    avoid: ['Climbing it wet — snapped holds are gone for good', NO_WIRE],
  },
  sandstone_soft: {
    swatch: 'sandstoneBuff',
    texture: 'bedded',
    tagline: 'Weakly cemented sandstone — the most fragile kind.',
    dries: 'days',
    whenWet: 'fragile',
    styles: ['Slopers', 'Pockets', 'Cracks'],
    rain: 'The slowest rock to dry, and it weakens badly while wet.',
    sun: 'The surface dries first — the inside takes far longer.',
    funFact: 'Some soft sandstone areas ban chalk and metal nuts outright to protect the rock.',
    care: ['Follow the local rules — they exist for this rock'],
    avoid: ['Climbing it damp', 'Wedging metal gear into cracks'],
  },
  limestone: {
    swatch: 'limestone',
    texture: 'pocketed',
    tagline: 'Stone built from ancient sea life.',
    dries: 'days',
    whenWet: 'softens',
    styles: ['Pockets', 'Tufas', 'Crimps', 'Overhangs'],
    rain: 'The kind isn’t recorded, so we time it like soft limestone. Seeps can run for weeks.',
    sun: 'Steep, shady walls stay climbable when slabs bake.',
    funFact: 'Limestone is made of shells and skeletons that settled on old seabeds.',
    care: ['Watch for polish on popular routes'],
    avoid: ['Trusting a seep-stained hold'],
  },
  limestone_dense: {
    swatch: 'limestone',
    texture: 'pocketed',
    tagline: 'Hard, compact limestone.',
    dries: 'day',
    whenWet: 'holds',
    styles: ['Pockets', 'Crimps', 'Tufas', 'Overhangs'],
    rain: 'The face dries within a day — seeps can stay wet for weeks.',
    sun: 'Steep, shady walls stay climbable when slabs bake.',
    funFact: 'Tufas grow where water runs down the wall, so a tufa marks a drainage line.',
    care: ['Watch for polish on popular routes'],
    avoid: ['Trusting a seep-stained hold'],
  },
  limestone_porous: {
    swatch: 'limestone',
    texture: 'pocketed',
    tagline: 'Soft, chalky limestone or tufa.',
    dries: 'days',
    whenWet: 'fragile',
    styles: ['Tufas', 'Pockets', 'Jugs'],
    rain: 'Drinks water and softens — wet tufa breaks.',
    sun: 'Sun helps the face, but soaked rock dries from the inside out slowly.',
    funFact: 'Tufa is limestone laid down again by dripping water — a stalactite on the outside of a cliff.',
    care: ['Give it days after rain'],
    avoid: ['Pulling on wet tufa', NO_WIRE],
  },
  dolomite: {
    swatch: 'pale',
    texture: 'pocketed',
    tagline: 'Limestone’s harder, magnesium-rich cousin.',
    dries: 'day',
    whenWet: 'holds',
    styles: ['Pockets', 'Edges', 'Crimps'],
    rain: 'Pockets hold water after the face has dried.',
    sun: 'Pale rock reflects sunlight and stays cooler than dark rock.',
    funFact: 'Named after the geologist Déodat de Dolomieu — Italy’s Dolomites are named after the rock, not the reverse.',
    care: ['Check pockets for water before committing'],
    avoid: ['Trusting a seep-stained hold'],
  },
  carbonate_cherty: {
    swatch: 'limestone',
    texture: 'banded',
    tagline: 'Limestone or dolomite with hard chert bands.',
    dries: 'day',
    whenWet: 'softens',
    styles: ['Edges', 'Crimps', 'Pockets'],
    rain: 'Holds loosen where the chert meets the softer rock, most of all when wet.',
    sun: 'Pale rock reflects sunlight and stays cooler than dark rock.',
    funFact: 'Chert is nearly pure silica — the same stone as flint, which people shaped into tools.',
    care: ['Test chert edges before weighting them'],
    avoid: ['Pulling on chert nodules while the rock is wet'],
  },
  conglomerate: {
    swatch: 'conglomerate',
    texture: 'clastic',
    tagline: 'Rounded pebbles and cobbles set in cement.',
    dries: 'days',
    whenWet: 'softens',
    styles: ['Cobbles', 'Pinches', 'Pockets'],
    rain: 'The cement holding the cobbles softens when wet, and you can’t see it happen.',
    sun: 'Shade and a breeze beat full sun for friction.',
    funFact: 'Each cobble was rounded in an ancient river or beach before being buried and cemented.',
    care: ['Test every cobble before pulling'],
    avoid: ['Pulling on cobbles while the rock is wet'],
  },
}

/** The guide for a rock type; `null` for `unknown` — nobody recorded the rock. */
export function rockGuide(rockType: RockType): RockGuide | null {
  return rockType === 'unknown' ? null : GUIDES[rockType]
}

/** The word under a drying gauge. */
export const DRYING_PACE_LABEL: Record<DryingPace, string> = {
  hours: 'Hours',
  day: 'A day or two',
  days: 'Days',
}

/** The word under a wet-strength gauge. */
export const WET_STRENGTH_LABEL: Record<WetStrength, string> = {
  holds: 'Holds up',
  softens: 'Softens',
  fragile: 'Fragile',
}

