import type { Guidebook, GuidebookRoute, GuidebookWall } from '@weatherteam6/types'
import { MN_GUIDEBOOK, MN_GUIDEBOOK_DATE } from './guidebookMn.js'

/** One OpenBeta area as `guidebookMn.ts` stores it, routes already in the response's shape. */
export type SnapshotArea = {
  id: string
  name: string
  /** Its ancestors' names, country first. */
  path: string[]
  /** The enclosing area's id; null above the state. */
  parent: string | null
  lat: number | null
  lon: number | null
  mp_id: string | null
  /** The routes directly on this area — not its sub-areas'. */
  routes: GuidebookRoute[]
}

/**
 * How far a saved location may sit from an area's points and still be that
 * crag. **The same 2 km as `KNOWN_CRAG_REACH_KM`, for the same reason**: a
 * location is saved at a car park or a town as often as at the rock — the
 * saved Red Wing sits ~1.2 km from Barn Bluff — and wider starts claiming the
 * next crag along.
 */
export const GUIDEBOOK_REACH_KM = 2

/**
 * The widest an area's own points may spread and still be one crag rather than
 * a region. Measured over Minnesota on 2026-09-28: every crag a climber would
 * name spans under 5 km (Barn Bluff 0.3, Taylors Falls 1.5, Swede's Forest 4.9),
 * while "Duluth Area (Rock and Ice)" spans 40 km and Tettegouche 303 km on a
 * misplaced point. A region's walls would be other crags, so a location there
 * links to the crag inside it instead.
 */
export const CRAG_MAX_SPAN_KM = 5

const KM_PER_DEG_LAT = 111.32

type Box = { south: number; north: number; west: number; east: number }

function kmAcross(b: Box): number {
  const mid = ((b.south + b.north) / 2) * (Math.PI / 180)
  return Math.hypot((b.north - b.south) * KM_PER_DEG_LAT, (b.east - b.west) * KM_PER_DEG_LAT * Math.cos(mid))
}

/** Flat-earth distance from a point to a box, 0 inside it — `knownCrags.ts`'s measure. */
function kmOutside(lat: number, lon: number, b: Box): number {
  const dLat = Math.max(b.south - lat, 0, lat - b.north) * KM_PER_DEG_LAT
  const dLon = Math.max(b.west - lon, 0, lon - b.east) * KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

type Node = { area: SnapshotArea; children: Node[]; routes: GuidebookRoute[]; box: Box | null }

/** Areas as a tree, each node carrying its whole subtree's routes and the box around its points. */
function buildTree(areas: readonly SnapshotArea[]): Node[] {
  const nodes = new Map<string, Node>()
  for (const area of areas) nodes.set(area.id, { area, children: [], routes: [], box: null })
  for (const node of nodes.values()) {
    const parent = node.area.parent === null ? undefined : nodes.get(node.area.parent)
    parent?.children.push(node)
  }
  const fill = (node: Node): void => {
    node.children.forEach(fill)
    node.routes = [...node.area.routes, ...node.children.flatMap((c) => c.routes)]
    const { lat, lon } = node.area
    const boxes = [
      ...(lat === null || lon === null ? [] : [{ south: lat, north: lat, west: lon, east: lon }]),
      ...node.children.map((c) => c.box).filter((b): b is Box => b !== null),
    ]
    node.box =
      boxes.length === 0
        ? null
        : {
            south: Math.min(...boxes.map((b) => b.south)),
            north: Math.max(...boxes.map((b) => b.north)),
            west: Math.min(...boxes.map((b) => b.west)),
            east: Math.max(...boxes.map((b) => b.east)),
          }
  }
  const roots = [...nodes.values()].filter((n) => n.area.parent === null || !nodes.has(n.area.parent))
  roots.forEach(fill)
  return [...nodes.values()]
}

/**
 * True when every route is on the wall itself and OpenBeta placed each at its
 * own position — the only case "left to right" is a fact rather than an order
 * the list happened to come out in.
 */
function isOrdered(node: Node): boolean {
  if (node.routes.length !== node.area.routes.length) return false
  const positions = node.routes.map((r) => r.left_right)
  return positions.every((p) => p !== null) && new Set(positions).size === positions.length
}

function toWall(node: Node): GuidebookWall {
  return {
    id: node.area.id,
    name: node.area.name,
    lat: node.area.lat,
    lon: node.area.lon,
    mp_id: node.area.mp_id,
    routes: node.routes,
    ordered: isOrdered(node),
  }
}

/**
 * The crag a saved location sits on, with its walls and routes — or null when
 * no OpenBeta crag is within reach, which is the ordinary answer for a city and
 * for anywhere outside Minnesota.
 *
 * **The crag with the most routes wins**, so a location between two walls of
 * Barn Bluff is Barn Bluff and not whichever wall's point happens to be nearer.
 * Distance breaks a tie. Areas spread wider than `CRAG_MAX_SPAN_KM` are regions
 * and are passed over for the crags inside them.
 */
export function guidebookFor(
  lat: number,
  lon: number,
  areas: readonly SnapshotArea[] = MN_GUIDEBOOK,
  snapshotDate: string = MN_GUIDEBOOK_DATE,
): Guidebook | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  let best: { node: Node; km: number } | null = null
  for (const node of buildTree(areas)) {
    if (node.box === null || node.routes.length === 0) continue
    if (node.area.lat === null || node.area.lon === null) continue
    if (kmAcross(node.box) > CRAG_MAX_SPAN_KM) continue
    const km = kmOutside(lat, lon, node.box)
    if (km > GUIDEBOOK_REACH_KM) continue
    if (
      best === null ||
      node.routes.length > best.node.routes.length ||
      (node.routes.length === best.node.routes.length && km < best.km)
    ) {
      best = { node, km }
    }
  }
  if (best === null) return null

  const { node } = best
  const withRoutes = node.children.filter((c) => c.routes.length > 0)
  // A crag with no sub-areas is its own single wall, so the wall screen is
  // still one tap away rather than missing.
  const walls = (withRoutes.length === 0 ? [node] : withRoutes)
    .map(toWall)
    // West to east, which is how the position strip draws them; a wall with no
    // point goes last rather than being placed at longitude zero.
    .sort((a, b) => (a.lon ?? Infinity) - (b.lon ?? Infinity) || a.name.localeCompare(b.name))

  return {
    snapshot_date: snapshotDate,
    crag: {
      id: node.area.id,
      name: node.area.name,
      path: node.area.path,
      lat: node.area.lat ?? lat,
      lon: node.area.lon ?? lon,
      mp_id: node.area.mp_id,
      route_count: node.routes.length,
    },
    walls,
  }
}
