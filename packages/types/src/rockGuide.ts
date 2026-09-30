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
    funFact: 'El Capitan is granite. Lynn Hill made the first free ascent of The Nose in 1993, after four days on the wall.',
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
    funFact: 'The Buttermilks’ granite highballs are glacial erratics — boulders a glacier carried in from somewhere else.',
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
    funFact: 'Carlton Peak’s anorthosite is so abrasive that climbers pad their top-rope anchors with old carpet to save the rope.',
    care: ['Tape up — it’s hard on skin'],
    avoid: [NO_WIRE],
  },
  syenite_porous: {
    swatch: 'granite',
    texture: 'pocketed',
    tagline: 'A porous igneous rock riddled with huecos.',
    dries: 'day',
    whenWet: 'fragile',
    styles: ['Huecos', 'Pockets', 'Roofs', 'Slopers'],
    rain: 'Huecos hold water for days, and wet holds snap.',
    sun: 'Desert sun dries the face quickly; the pockets lag behind.',
    funFact: 'Even roofs aren’t safe wet at Hueco: a roof hueco on Nobody Here Gets Out Alive broke after several days of rain.',
    care: ['Wait at least a day after rain — the park enforces it'],
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
    funFact: 'Palisade Head is a 1.1-billion-year-old rhyolite lava flow, and most of its lakeshore routes take trad gear.',
    care: ['Check blocks and flakes — fractured volcanic rock can be loose'],
    avoid: [NO_WIRE],
  },
  basalt_dense: {
    swatch: 'basalt',
    texture: 'columnar',
    tagline: 'Dense lava rock, split by cooling joints into blocks or columns.',
    dries: 'hours',
    whenWet: 'holds',
    styles: ['Cracks', 'Stemming', 'Corners', 'Arêtes'],
    rain: 'Almost no pore space — dries in hours and loses no strength.',
    sun: 'Dark rock soaks up sun, so a sunny face gets hot fast.',
    funFact: 'Taylors Falls basalt is cut by vertical and horizontal cooling joints, which shaped the cliffs along the Dalles.',
    care: ['Check blocks between joints — freeze and thaw loosens them'],
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
    funFact: 'Vantage climbs splitter cracks between basalt columns; Taos’s Rio Grande Gorge climbs air-pocketed lava.',
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
    funFact: 'The main walls of the Rio Grande Gorge near Taos are vesicular basalt — “air pocketed” lava.',
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
    rain: 'Dries fast and holds up like granite. Locals go once the ground is dry.',
    sun: 'Shade and a breeze beat full sun for friction.',
    funFact: 'A Smith Rock regular on its tuff: it “dries out almost instantaneously because it’s so porous.”',
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
    funFact: 'Bishop’s Happy and Sad Boulders are soft tuff eroded into channels, huecos and tons of finger pockets.',
    care: ['Give it days after rain, not hours'],
    avoid: ['Climbing it damp — holds crumble', NO_WIRE],
  },
  volcanic_breccia: {
    swatch: 'tuff',
    texture: 'clastic',
    tagline: 'Angular chunks of rock set in a finer cement.',
    dries: 'days',
    whenWet: 'fragile',
    styles: ['Knobs', 'Edges', 'Pockets'],
    rain: 'Brittle when wet and slow to dry. Locals give it several sunny days after a storm.',
    sun: 'Shade and a breeze beat full sun for friction.',
    funFact: 'Pinnacles climbers have long held that the breccia breaks easily for several days after a rainstorm.',
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
    funFact: 'Devil’s Lake may be the only crag where the lichen has more friction than the quartzite.',
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
    funFact: 'Johnny Dawes on The Quarryman (E8, 1986), Dinorwig’s slate testpiece: “For god’s sake, are you a foothold or not?!”',
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
    funFact: 'Rumney’s schist can be climbable a few hours after rain on a sunny, windy day — but Bonsai wall seeps after a few days of rain.',
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
    funFact: 'Moab’s climbers’ page pleads “PLEASE DO NOT CLIMB IN MOAB during or after rain” — wet holds rip off for good.',
    care: ['Dig into the sand at the base: damp sand means damp rock'],
    avoid: ['Climbing it damp — holds break and never grow back', NO_WIRE],
  },
  // Fragile, not holds (owner, 2026-09-29): Hinckley Sandstone at Robinson Park
  // is ~96% quartz and still breaks after rain, and the local ethic is to stay
  // off it. The ~0% wet strength loss in the research is one lab result for
  // clean, clay-free rock — the cement decides, and it is not visible.
  sandstone_quartz_arenite: {
    swatch: 'sandstoneBuff',
    texture: 'bedded',
    tagline: 'Quartz sand grains, cemented together.',
    dries: 'day',
    whenWet: 'fragile',
    styles: ['Edges', 'Slopers', 'Friction'],
    rain: 'Tough quartz grains, but the cement between them weakens when wet. Give it a day or two.',
    sun: 'Grippy when cool; slopers go greasy in the heat.',
    funFact: 'Fontainebleau’s boulders are silica-hardened sandstone, and the Font bouldering grade was born there.',
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
    funFact: 'In the Red River Gorge, iron-rich Liesegang bands stick out of the sandstone and become extra holds.',
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
    funFact: 'Lab tests found Millstone Grit, the Peak District’s climbing rock, up to 41% weaker when wet.',
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
    funFact: 'At Red Rock, the varnished rock gives the superb climbing; unvarnished rock can be soft, sandy and rounded.',
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
    funFact: 'Saxon pioneer Rudolf Fehrmann pushed rope-soled slippers and a minimum of metal gear to spare the fragile rock.',
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
    funFact: 'In the Frankenjura’s sheltered crags, some walls seep long after a rainstorm and take a long time to dry.',
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
    funFact: 'Céüse’s overhanging limestone holds Biographie (Realization), the world’s first consensus 9a+, sent in 2001.',
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
    funFact: 'Water lingers longest on tufas. Seb Bouin shows how to dry a whole tufa column with a scrap of toilet paper.',
    care: ['Give it days after rain'],
    avoid: ['Pulling on wet tufa', NO_WIRE],
  },
  dolomite: {
    swatch: 'pale',
    texture: 'pocketed',
    tagline: 'Limestone’s harder, magnesium-rich cousin.',
    dries: 'day',
    whenWet: 'softens',
    styles: ['Pockets', 'Edges', 'Crimps'],
    rain: 'Pockets hold water after the face has dried, and damp holds can break.',
    sun: 'Pale rock reflects sunlight and stays cooler than dark rock.',
    funFact: 'Willow River’s dolomite “becomes breakable when wet”, and river levels and snowmelt can leave it seeping.',
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
    funFact: 'At Red Wing’s Barn Bluff a climber broke off a baseball-sized hold, and locals advise a helmet.',
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
    funFact: 'At Maple Canyon, cobbles “rip all the time, especially after the freeze thaw cycles in the spring.”',
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

