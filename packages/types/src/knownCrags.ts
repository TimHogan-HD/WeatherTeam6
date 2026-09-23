import type { RockType } from './index.js'

/**
 * **Crags whose rock the research has established, and where they are.**
 *
 * Owner decision 2026-09-23: known rock types for known crags are **locked in**.
 * A saved climbing location that falls on one of these takes its rock type
 * from here and not from the person saving it — the picker shows it and does
 * not offer to change it, and `POST /locations` ignores a rock type sent for it.
 *
 * This exists because the owner's own saved crags were wrong in the way the
 * research predicted: Red Wing was saved as `sandstone` and is cherty Oneota
 * Dolomite (`crag-facts.json` calls it *"commonly mislabelled sandstone"*), and
 * the rock type is the single largest lever on the drying window.
 *
 * **Three sources per entry, and none of them is this file.**
 *
 * - `facts` names the crag in `.claude/docs/crag-facts.json`, which carries the
 *   rock family, its confidence and the section it came from. `knownCrags.test.ts`
 *   fails if the name is missing there or its family does not map to `rock_type`.
 * - `rock_type` is that family mapped onto `rock-drying-research.md` §7's
 *   taxonomy. **An entry is here only when the facts pin one §7 value** — "it is
 *   sandstone" is not enough when there are six sandstones, so Robinson Park,
 *   the Obed, Siurana and the other generic entries are left for the user.
 * - `bbox` is OpenStreetMap's bounding box for the feature named in `osm`, as
 *   Nominatim returned it on 2026-09-23. Where OSM has only a point (a peak, a
 *   cape), the box is that point.
 *
 * **Deliberately absent**, and each for a reason a later reader would otherwise
 * rediscover:
 *
 * - **Areas larger than ~30 km across** — Red Rock NCA (73 km), Zion (52), New
 *   River Gorge (56), Joshua Tree (121), Indian Creek (57). A box that size
 *   covers rock that is not the crag's; Red Rock's conservation area reaches
 *   the limestone of the La Madre range.
 * - **Montsant**: its park boundary comes within 1.9 km of Siurana, which is
 *   limestone. Locking would have written conglomerate onto it.
 * - **Mixed or ambiguous rock** — Sinks Canyon (three rocks stacked in one
 *   canyon), the Gunks (conglomerate that behaves as quartzite), Kalymnos and the
 *   tufa crags (a fast-drying wall and a seeping tufa on the same day), Devils
 *   Tower and the Palisades (phonolite and diabase have no §7 value).
 * - **Not resolvable on OSM** — Red River Gorge, Ten Sleep, Wild Iris (the only
 *   hit was a road of that name near Laramie, 280 km away), the Happy and Sad
 *   Boulders, Little Cottonwood (only road fragments at Alta).
 */
export type KnownCrag = {
  readonly slug: string
  readonly name: string
  /** The crag's `name` in `crag-facts.json`. Several entries may share one. */
  readonly facts: string
  readonly rock_type: RockType
  /** OpenStreetMap feature the box came from, `type/id`. */
  readonly osm: string
  readonly bbox: { readonly south: number; readonly north: number; readonly west: number; readonly east: number }
}

/**
 * **How far outside its box a saved point may sit and still be that crag, in
 * km.** A saved point is often the trailhead, the parking or the campground
 * rather than the wall, and OSM draws some crags as a single point.
 *
 * **Chosen on the neighbours, and it is a judgement call.** 3 km put
 * Siurana's limestone inside Montsant's conglomerate and Dinas Cromlech's
 * volcanic rock inside the Dinorwig slate quarry (3.2 km). At 2 km Dinas
 * Cromlech, the Golden Cliffs basalt (3.5 km from Clear Creek) and every other
 * neighbour tested stay out — the price is that a town 2.6 km from a park, like
 * Baraboo from Devil's Lake, is not that park. Widening this is a change to what
 * gets locked, and `knownCrags.test.ts` holds the neighbours that decided it.
 */
export const KNOWN_CRAG_REACH_KM = 2

const box = (south: number, north: number, west: number, east: number) => ({ south, north, west, east })

export const KNOWN_CRAGS: readonly KnownCrag[] = [
  // ── Upper Midwest (rock-drying-research.md §4.7, §4.9) ──────────────────────
  { slug: 'red-wing', name: 'Red Wing (Barn Bluff)', facts: 'Red Wing', rock_type: 'carbonate_cherty', osm: 'way/198488517', bbox: box(44.5678138, 44.5710421, -92.5326664, -92.5192596) },
  { slug: 'willow-river', name: 'Willow River State Park', facts: 'Willow River State Park', rock_type: 'dolomite', osm: 'relation/9406770', bbox: box(44.999414, 45.039142, -92.7315964, -92.6273822) },
  { slug: 'taylors-falls', name: 'Taylors Falls (Interstate State Park)', facts: 'Taylors Falls', rock_type: 'basalt_dense', osm: 'relation/6979200', bbox: box(45.3877767, 45.4030297, -92.672682, -92.6505129) },
  { slug: 'palisade-head', name: 'Palisade Head', facts: 'Palisade Head and Shovel Point', rock_type: 'rhyolite', osm: 'way/1364090751', bbox: box(47.318561, 47.3228107, -91.2126159, -91.2088757) },
  { slug: 'shovel-point', name: 'Shovel Point', facts: 'Palisade Head and Shovel Point', rock_type: 'rhyolite', osm: 'node/12801649903', bbox: box(47.3395308, 47.3395308, -91.1848677, -91.1848677) },
  { slug: 'carlton-peak', name: 'Carlton Peak', facts: 'Carlton Peak', rock_type: 'anorthosite', osm: 'node/1743950114', bbox: box(47.5842551, 47.5842551, -90.8598093, -90.8598093) },
  { slug: 'blue-mounds', name: 'Blue Mounds State Park', facts: 'Blue Mounds State Park', rock_type: 'quartzite', osm: 'way/188688376', bbox: box(43.6888822, 43.7249006, -96.2125406, -96.1720558) },
  { slug: 'devils-lake', name: "Devil's Lake State Park", facts: "Devil's Lake", rock_type: 'quartzite', osm: 'relation/11121544', bbox: box(43.3825944, 43.4480577, -89.7587429, -89.6503025) },
  { slug: 'the-needles', name: 'The Needles (Cathedral Spires)', facts: 'The Needles', rock_type: 'granite', osm: 'node/4588696945', bbox: box(43.8488773, 43.8488773, -103.5336924, -103.5336924) },
  { slug: 'spearfish-canyon', name: 'Spearfish Canyon', facts: 'Spearfish Canyon', rock_type: 'carbonate_cherty', osm: 'relation/5625090', bbox: box(44.3397624, 44.3555385, -103.9462456, -103.9171999) },
  { slug: 'lions-head', name: "Lion's Head", facts: "Lion's Head", rock_type: 'dolomite', osm: 'way/60862376', bbox: box(44.9674117, 45.0089472, -81.2351785, -81.1946413) },

  // ── Rockies and the West ────────────────────────────────────────────────────
  { slug: 'vedauwoo', name: 'Vedauwoo', facts: 'Vedauwoo', rock_type: 'granite', osm: 'node/356507102', bbox: box(41.1660934, 41.1660934, -105.3755405, -105.3755405) },
  { slug: 'penitente-canyon', name: 'Penitente Canyon', facts: 'Penitente Canyon', rock_type: 'tuff_welded', osm: 'way/308602151', bbox: box(37.8364509, 37.8433784, -106.2857238, -106.2701979) },
  { slug: 'clear-creek-canyon', name: 'Clear Creek Canyon', facts: 'Clear Creek Canyon', rock_type: 'gneiss_schist', osm: 'relation/9847282', bbox: box(39.7212082, 39.7579594, -105.3978808, -105.2351329) },
  { slug: 'eldorado-canyon', name: 'Eldorado Canyon', facts: 'Eldorado Canyon and the Flatirons', rock_type: 'sandstone_arkose', osm: 'relation/8890542', bbox: box(39.898918, 39.9394499, -105.3455109, -105.2764489) },
  { slug: 'flatirons', name: 'The Flatirons', facts: 'Eldorado Canyon and the Flatirons', rock_type: 'sandstone_arkose', osm: 'node/358916595', bbox: box(39.9841526, 39.9841526, -105.2941576, -105.2941576) },
  { slug: 'turkey-rocks', name: 'Turkey Rocks', facts: 'Turkey Rocks', rock_type: 'granite', osm: 'node/358920156', bbox: box(39.1138801, 39.1138801, -105.2394371, -105.2394371) },
  { slug: 'big-cottonwood', name: 'Big Cottonwood Canyon', facts: 'Big Cottonwood Canyon', rock_type: 'quartzite', osm: 'way/1535693394', bbox: box(40.6183564, 40.6516016, -111.7798006, -111.5940142) },
  { slug: 'maple-canyon', name: 'Maple Canyon', facts: 'Maple Canyon', rock_type: 'conglomerate', osm: 'way/1274512372', bbox: box(39.5424199, 39.5607125, -111.68769, -111.6493373) },
  { slug: 'smith-rock', name: 'Smith Rock State Park', facts: 'Smith Rock', rock_type: 'tuff_welded', osm: 'way/419727037', bbox: box(44.3561221, 44.377758, -121.1516218, -121.1281176) },
  { slug: 'trout-creek', name: 'Trout Creek', facts: 'Trout Creek', rock_type: 'basalt_dense', osm: 'way/555565221', bbox: box(44.8134887, 44.815968, -121.0964692, -121.0948706) },
  { slug: 'frenchman-coulee', name: 'Frenchman Coulee', facts: 'Frenchman Coulee', rock_type: 'basalt_dense', osm: 'node/12752847066', bbox: box(47.0300328, 47.0300328, -119.969523, -119.969523) },
  { slug: 'index', name: 'Index Town Walls', facts: 'Index', rock_type: 'granite', osm: 'way/145298210', bbox: box(47.8174594, 47.8176593, -121.5715367, -121.5709592) },
  { slug: 'squamish', name: 'Squamish (Stawamus Chief)', facts: 'Squamish', rock_type: 'granite', osm: 'relation/8634840', bbox: box(49.6631581, 49.7058364, -123.1598261, -123.1048299) },

  // ── California and the Southwest ────────────────────────────────────────────
  { slug: 'yosemite-valley', name: 'Yosemite Valley', facts: 'Yosemite Valley', rock_type: 'granite', osm: 'way/1208599256', bbox: box(37.7170967, 37.7456752, -119.6758748, -119.5473004) },
  { slug: 'tuolumne-meadows', name: 'Tuolumne Meadows', facts: 'Tuolumne Meadows', rock_type: 'granite', osm: 'relation/12774701', bbox: box(37.8719739, 37.8869671, -119.3951976, -119.353559) },
  { slug: 'buttermilks', name: 'The Buttermilks', facts: 'The Buttermilks', rock_type: 'granite_weathered', osm: 'relation/19531541', bbox: box(37.2957946, 37.3101648, -118.6189985, -118.597198) },
  { slug: 'pinnacles', name: 'Pinnacles National Park', facts: 'Pinnacles National Park', rock_type: 'volcanic_breccia', osm: 'relation/6183160', bbox: box(36.4084002, 36.5641575, -121.2455212, -121.1012111) },
  { slug: 'oak-flat', name: 'Queen Creek and Oak Flat', facts: 'Queen Creek and Oak Flat', rock_type: 'tuff_welded', osm: 'node/2371302890', bbox: box(33.3090476, 33.3090476, -111.0486836, -111.0486836) },
  { slug: 'cochise-stronghold', name: 'Cochise Stronghold', facts: 'Cochise Stronghold', rock_type: 'granite', osm: 'node/14135956547', bbox: box(32.0082714, 32.0082714, -109.3117267, -109.3117267) },
  { slug: 'hueco-tanks', name: 'Hueco Tanks', facts: 'Hueco Tanks', rock_type: 'syenite_porous', osm: 'way/28663887', bbox: box(31.9068363, 31.9278238, -106.0519321, -106.0356522) },
  { slug: 'enchanted-rock', name: 'Enchanted Rock', facts: 'Enchanted Rock', rock_type: 'granite', osm: 'way/28714788', bbox: box(30.4924734, 30.5158179, -98.8390266, -98.8009428) },

  // ── The East ────────────────────────────────────────────────────────────────
  { slug: 'seneca-rocks', name: 'Seneca Rocks', facts: 'Seneca Rocks', rock_type: 'quartzite', osm: 'way/607537275', bbox: box(38.8331073, 38.8362663, -79.3674593, -79.3652476) },
  { slug: 'rumney', name: 'Rumney', facts: 'Rumney', rock_type: 'gneiss_schist', osm: 'node/357730653', bbox: box(43.8072929, 43.8072929, -71.8403594, -71.8403594) },
  { slug: 'cathedral-ledge', name: 'Cathedral Ledge', facts: 'Cathedral and Whitehorse Ledges', rock_type: 'granite', osm: 'way/334091493', bbox: box(44.0608197, 44.0672546, -71.1669599, -71.1652651) },
  { slug: 'whitehorse-ledge', name: 'Whitehorse Ledge', facts: 'Cathedral and Whitehorse Ledges', rock_type: 'granite', osm: 'relation/15881946', bbox: box(44.0509592, 44.055472, -71.1700639, -71.1660245) },
  { slug: 'carderock', name: 'Carderock', facts: 'Carderock and Great Falls', rock_type: 'gneiss_schist', osm: 'node/158354366', bbox: box(38.9776102, 38.9776102, -77.1944245, -77.1944245) },
  { slug: 'poke-o-moonshine', name: 'Poke-O-Moonshine', facts: 'Poke-O-Moonshine', rock_type: 'anorthosite', osm: 'node/357577633', bbox: box(44.401715, 44.401715, -73.51319, -73.51319) },
  { slug: 'looking-glass', name: 'Looking Glass Rock', facts: 'Looking Glass Rock', rock_type: 'granite', osm: 'way/485521315', bbox: box(35.3010707, 35.3059811, -82.7957352, -82.7898647) },
  { slug: 'rumbling-bald', name: 'Rumbling Bald', facts: 'Rumbling Bald', rock_type: 'granite', osm: 'node/357784171', bbox: box(35.4598419, 35.4598419, -82.2267791, -82.2267791) },
  { slug: 'bon-echo', name: 'Bon Echo', facts: 'Bon Echo', rock_type: 'granite', osm: 'relation/903798', bbox: box(44.8640525, 44.9511891, -77.3404813, -77.1088635) },

  // ── Europe ──────────────────────────────────────────────────────────────────
  { slug: 'stanage', name: 'Stanage Edge', facts: 'Stanage and the Peak District grit', rock_type: 'sandstone_arkose', osm: 'way/377546210', bbox: box(53.3585848, 53.3678182, -1.6643214, -1.6447519) },
  { slug: 'harrisons-rocks', name: "Harrison's Rocks", facts: 'Southern Sandstone', rock_type: 'sandstone_soft', osm: 'way/54847882', bbox: box(51.0972008, 51.102537, 0.1858441, 0.1882571) },
  { slug: 'high-rocks', name: 'High Rocks', facts: 'Southern Sandstone', rock_type: 'sandstone_soft', osm: 'way/98937366', bbox: box(51.1236294, 51.1247117, 0.2265534, 0.2414993) },
  { slug: 'elbsandstein', name: 'Saxon Switzerland', facts: 'Elbsandsteingebirge', rock_type: 'sandstone_soft', osm: 'relation/1595534', bbox: box(50.8839154, 50.9970886, 14.018499, 14.4021733) },
  { slug: 'dinorwig', name: 'Dinorwig slate quarries', facts: 'Llanberis slate', rock_type: 'slate', osm: 'way/38775657', bbox: box(53.1100608, 53.1337009, -4.1085223, -4.0842708) },
  { slug: 'ceuse', name: 'Céüse', facts: 'Céüse', rock_type: 'limestone_dense', osm: 'way/1527945284', bbox: box(44.5009801, 44.5306077, 5.9392101, 5.9617107) },
  { slug: 'verdon', name: 'Verdon Gorge', facts: 'Verdon Gorge', rock_type: 'limestone_dense', osm: 'node/7193513219', bbox: box(43.7496562, 43.7496562, 6.3285616, 6.3285616) },
  { slug: 'magic-wood', name: 'Magic Wood', facts: 'Magic Wood', rock_type: 'gneiss_schist', osm: 'node/240094598', bbox: box(46.5369192, 46.5769192, 9.4194374, 9.4594374) },
  { slug: 'riglos', name: 'Mallos de Riglos', facts: 'Riglos', rock_type: 'conglomerate', osm: 'relation/14622892', bbox: box(42.3405183, 42.3556927, -0.7327232, -0.7000195) },
  { slug: 'margalef', name: 'Margalef', facts: 'Margalef', rock_type: 'conglomerate', osm: 'relation/342456', bbox: box(41.2671727, 41.334276, 0.736295, 0.8147193) },
  { slug: 'meteora', name: 'Meteora', facts: 'Meteora', rock_type: 'conglomerate', osm: 'way/399713412', bbox: box(39.7061471, 39.7375441, 21.6166274, 21.6444079) },

  // ── Elsewhere ───────────────────────────────────────────────────────────────
  { slug: 'arapiles', name: 'Mount Arapiles', facts: 'Mount Arapiles', rock_type: 'quartzite', osm: 'node/426734442', bbox: box(-36.7522254, -36.7522254, 141.8353365, 141.8353365) },
  { slug: 'ogawayama', name: 'Ogawayama', facts: 'Ogawayama', rock_type: 'granite', osm: 'node/6247168026', bbox: box(35.9094463, 35.9094463, 138.6122912, 138.6122912) },
]

const KM_PER_DEG_LAT = 111.32

/** Distance from a point to a box, in km; 0 inside it. Flat-earth, fine at these scales. */
function kmOutside(lat: number, lon: number, b: KnownCrag['bbox']): number {
  const dLat = Math.max(b.south - lat, 0, lat - b.north) * KM_PER_DEG_LAT
  const dLon = Math.max(b.west - lon, 0, lon - b.east) * KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/**
 * The known crag a point sits on, or null.
 *
 * **One implementation, used by both sides.** The API calls it on save and
 * trusts nothing else; the add flow calls it to show the lock before saving, so
 * the picker never offers a choice the server will overrule.
 *
 * Nearest wins when two reach the point, and a point *inside* two overlapping
 * boxes goes to the smaller — the more specific feature.
 */
export function matchKnownCrag(lat: number, lon: number): KnownCrag | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  let best: { crag: KnownCrag; km: number; area: number } | null = null
  for (const crag of KNOWN_CRAGS) {
    const km = kmOutside(lat, lon, crag.bbox)
    if (km > KNOWN_CRAG_REACH_KM) continue
    const area = (crag.bbox.north - crag.bbox.south) * (crag.bbox.east - crag.bbox.west)
    if (best === null || km < best.km || (km === best.km && area < best.area)) {
      best = { crag, km, area }
    }
  }
  return best?.crag ?? null
}

/** The entry for a stored slug, or null for one this build does not know. */
export function knownCragBySlug(slug: string | null | undefined): KnownCrag | null {
  if (slug === null || slug === undefined) return null
  return KNOWN_CRAGS.find((c) => c.slug === slug) ?? null
}
