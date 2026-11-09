import type { Guidebook, GuidebookRoute, GuidebookWall } from '@weatherteam6/types'
import { MN_GUIDEBOOK, MN_GUIDEBOOK_DATE } from './guidebookMn.js'
import { GUIDEBOOK_OVERLAY, type OverlayArea } from './guidebookOverlay.js'

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
    // One level down, by the same rule as the crag's walls: a child with no
    // routes anywhere under it is nothing a climber could have been on.
    sub_walls: node.children
      .filter((c) => c.routes.length > 0)
      .map((c) => ({ id: c.area.id, name: c.area.name, route_ids: c.routes.map((r) => r.id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/**
 * The snapshot with the hand-written overlay laid over it: each overlay area
 * becomes a child of its OpenBeta parent, takes the routes it names off that
 * parent, and adds the problems OpenBeta lacks.
 *
 * **It never throws and never duplicates a route**, because a re-pull can move
 * things under it. Whatever it cannot apply cleanly it skips and names in
 * `problems`, and `guidebook.test.ts` fails on any problem with the committed
 * files, so a pull that broke the overlay is caught before it ships:
 * - a route claimed twice stays on the first boulder that claims it;
 * - a claimed id that is not on the parent (unknown, or moved by OpenBeta into a
 *   sub-area of its own) stays where OpenBeta put it;
 * - an OpenBeta child of the same name is used instead of a second boulder;
 * - an added problem whose Mountain Project id OpenBeta now has is dropped.
 */
export function applyOverlay(
  areas: readonly SnapshotArea[],
  overlay: readonly OverlayArea[],
): { areas: SnapshotArea[]; problems: string[] } {
  const problems: string[] = []
  // Copies, so the committed snapshot is never mutated.
  const out = areas.map((a) => ({ ...a, routes: [...a.routes] }))
  const byId = new Map(out.map((a) => [a.id, a]))
  const routeIds = new Set(out.flatMap((a) => a.routes.map((r) => r.id)))
  const mpIds = new Set(out.flatMap((a) => a.routes.map((r) => r.mp_id)).filter((m): m is string => m !== null))
  const claimed = new Set<string>()

  for (const entry of overlay) {
    const parent = byId.get(entry.parent)
    if (parent === undefined) {
      problems.push(`${entry.name}: parent ${entry.parent} is not in the snapshot`)
      continue
    }
    if (byId.has(entry.id)) {
      problems.push(`${entry.name}: id ${entry.id} is already an area in the snapshot`)
      continue
    }
    const key = entry.name.trim().toLowerCase()
    let target = out.find((a) => a.parent === parent.id && a.name.trim().toLowerCase() === key)
    if (target !== undefined) {
      problems.push(`${entry.name}: OpenBeta now has this area under ${parent.name}; the overlay entry can go`)
    } else {
      target = {
        id: entry.id,
        name: entry.name,
        path: [...parent.path, parent.name],
        parent: parent.id,
        lat: null,
        lon: null,
        mp_id: null,
        routes: [],
      }
      out.push(target)
      byId.set(target.id, target)
    }

    for (const id of entry.route_ids) {
      if (claimed.has(id)) {
        problems.push(`${entry.name}: route ${id} is already on another overlay boulder`)
        continue
      }
      const i = parent.routes.findIndex((r) => r.id === id)
      if (i === -1) {
        if (!target.routes.some((r) => r.id === id)) {
          problems.push(`${entry.name}: route ${id} is not directly on ${parent.name}`)
        }
        continue
      }
      claimed.add(id)
      target.routes.push(...parent.routes.splice(i, 1))
    }
    for (const r of entry.routes) {
      if (routeIds.has(r.id)) {
        problems.push(`${entry.name}: route id ${r.id} (${r.name}) is already in the snapshot`)
        continue
      }
      if (r.mp_id !== null && mpIds.has(r.mp_id)) {
        problems.push(`${entry.name}: OpenBeta now has ${r.name} (Mountain Project ${r.mp_id}); the overlay entry can go`)
        continue
      }
      routeIds.add(r.id)
      if (r.mp_id !== null) mpIds.add(r.mp_id)
      target.routes.push(r)
    }
  }
  return { areas: out, problems }
}

let overlaid: SnapshotArea[] | null = null

/** The areas every request reads: the Minnesota snapshot with the overlay applied, built once per process. */
export function guidebookAreas(): readonly SnapshotArea[] {
  overlaid ??= applyOverlay(MN_GUIDEBOOK, GUIDEBOOK_OVERLAY).areas
  return overlaid
}

let snapshotIds: { areas: Set<string>; routes: Set<string> } | null = null

/** Built on first use: ~400 areas and ~1,900 routes, read once per process. */
function idsInSnapshot(): { areas: Set<string>; routes: Set<string> } {
  const areas = guidebookAreas()
  snapshotIds ??= {
    areas: new Set(areas.map((a) => a.id)),
    routes: new Set(areas.flatMap((a) => a.routes.map((r) => r.id))),
  }
  return snapshotIds
}

/**
 * Whether the committed snapshot holds this route. A tick or to-do has no FK to
 * refuse an id nobody has ever seen, so this is the check.
 */
export function routeExists(id: string): boolean {
  return idsInSnapshot().routes.has(id)
}

/** Whether the committed snapshot holds this area — the check before a position is recorded. */
export function areaExists(id: string): boolean {
  return idsInSnapshot().areas.has(id)
}

type Candidate = { node: Node; km: number; depth: number }

/** True when one node is the other or contains it. */
function overlaps(a: Node, b: Node, byId: Map<string, Node>): boolean {
  const within = (inner: Node, outer: Node): boolean => {
    for (let n: Node | undefined = inner; n !== undefined; n = n.area.parent === null ? undefined : byId.get(n.area.parent)) {
      if (n === outer) return true
    }
    return false
  }
  return within(a, b) || within(b, a)
}

function wallsOf(node: Node): GuidebookWall[] {
  const withRoutes = node.children.filter((c) => c.routes.length > 0)
  // A crag with no sub-areas is its own single wall, so the wall screen is
  // still one tap away rather than missing.
  return (withRoutes.length === 0 ? [node] : withRoutes).map(toWall)
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
 *
 * **Every other crag within reach lists its walls too** (owner, 2026-11-09), in
 * `nearby`: Sandstone's Robinson Park and Eldon sit 0.2 km apart under one
 * saved location, and a forecast check at Eldon could not name Eldon while
 * only Robinson Park was offered. Each further crag must be disjoint from every
 * one already taken — never a wall of one, never the region around it — and
 * among those with the same routes the outermost is taken, so Eldon arrives as
 * one wall of Sandstone Bouldering with its boulders under it rather than as
 * two dozen boulders loose in the list.
 */
export function guidebookFor(
  lat: number,
  lon: number,
  areas: readonly SnapshotArea[] = guidebookAreas(),
  snapshotDate: string = MN_GUIDEBOOK_DATE,
): Guidebook | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const tree = buildTree(areas)
  const byId = new Map(tree.map((n) => [n.area.id, n]))
  const depthOf = (node: Node): number => {
    let d = 0
    for (let n = node; n.area.parent !== null && byId.has(n.area.parent); n = byId.get(n.area.parent) as Node) d += 1
    return d
  }

  const candidates: Candidate[] = []
  for (const node of tree) {
    if (node.box === null || node.routes.length === 0) continue
    if (node.area.lat === null || node.area.lon === null) continue
    if (kmAcross(node.box) > CRAG_MAX_SPAN_KM) continue
    const km = kmOutside(lat, lon, node.box)
    if (km > GUIDEBOOK_REACH_KM) continue
    candidates.push({ node, km, depth: depthOf(node) })
  }

  // The crag itself, by the rule that has always picked it: most routes, then nearest.
  let best: Candidate | null = null
  for (const c of candidates) {
    if (
      best === null ||
      c.node.routes.length > best.node.routes.length ||
      (c.node.routes.length === best.node.routes.length && c.km < best.km)
    ) {
      best = c
    }
  }
  if (best === null) return null

  const taken: Node[] = [best.node]
  const others = candidates
    .filter((c) => c !== best)
    .sort((a, b) => b.node.routes.length - a.node.routes.length || a.depth - b.depth || a.km - b.km)
  for (const c of others) {
    if (taken.some((t) => overlaps(t, c.node, byId))) continue
    taken.push(c.node)
  }

  const { node } = best
  const nearby = taken.slice(1)
  const walls = taken
    .flatMap(wallsOf)
    // By name. **Not west to east**: OpenBeta's wall points are wrong on the
    // ground at Barn Bluff (owner, 2026-09-29), so an order read off them
    // states a layout nobody measured.
    .sort((a, b) => a.name.localeCompare(b.name))

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
    nearby: nearby.map((n) => ({ id: n.area.id, name: n.area.name, route_count: n.routes.length })),
    walls,
  }
}
