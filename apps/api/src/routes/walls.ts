import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { walls } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import type { ApiResponse, Wall, CreateWallInput } from '@weatherteam6/types'

export const wallsRouter = Router()

type WallRow = typeof walls.$inferSelect

function mapWall(row: WallRow): Wall {
  return {
    id: row.id,
    locationId: row.location_id,
    name: row.name,
    aspectDeg: row.aspect_deg,
    aspectSource: row.aspect_source as 'terrain' | 'manual',
    angleDeg: row.angle_deg,
    angleBand: row.angle_band as 'slab' | 'vertical' | 'steep' | 'roof',
    routeCount: row.route_count,
    createdAt: row.created_at.toISOString(),
  }
}

wallsRouter.get('/walls/:locationId', async (req: Request, res: Response) => {
  const locationId = req.params['locationId']
  if (!locationId || !isUuid(locationId)) {
    const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    const rows = await db
      .select()
      .from(walls)
      .where(and(eq(walls.location_id, locationId), eq(walls.user_id, req.userId)))
    const response: ApiResponse<Wall[]> = { data: rows.map(mapWall), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /walls/:locationId')
  }
})

wallsRouter.post('/walls', async (req: Request, res: Response) => {
  const body = req.body as Partial<CreateWallInput>
  const { locationId, name, aspectDeg, aspectSource, angleDeg, angleBand, routeCount } = body

  if (
    !locationId || !isUuid(locationId) ||
    typeof name !== 'string' || name.trim() === '' ||
    typeof aspectDeg !== 'number' ||
    (aspectSource !== 'terrain' && aspectSource !== 'manual') ||
    typeof angleDeg !== 'number' ||
    !['slab', 'vertical', 'steep', 'roof'].includes(angleBand as string)
  ) {
    const response: ApiResponse<null> = { data: null, error: 'Invalid wall data', status: 400 }
    res.status(400).json(response)
    return
  }

  try {
    const rows = await db
      .insert(walls)
      .values({
        location_id: locationId,
        user_id: req.userId,
        name: name.trim(),
        aspect_deg: aspectDeg,
        aspect_source: aspectSource,
        angle_deg: angleDeg,
        angle_band: angleBand as string,
        route_count: routeCount ?? null,
      })
      .returning()
    const row = rows[0]
    if (!row) throw new Error('Insert returned no row')
    const response: ApiResponse<Wall> = { data: mapWall(row), error: null, status: 201 }
    res.status(201).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /walls')
  }
})

wallsRouter.delete('/walls/:wallId', async (req: Request, res: Response) => {
  const wallId = req.params['wallId']
  if (!wallId || !isUuid(wallId)) {
    const response: ApiResponse<null> = { data: null, error: 'Wall not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    const rows = await db
      .delete(walls)
      .where(and(eq(walls.id, wallId), eq(walls.user_id, req.userId)))
      .returning()
    if (rows.length === 0) {
      const response: ApiResponse<null> = { data: null, error: 'Wall not found', status: 404 }
      res.status(404).json(response)
      return
    }
    const response: ApiResponse<null> = { data: null, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'DELETE /walls/:wallId')
  }
})
