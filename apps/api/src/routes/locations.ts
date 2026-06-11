import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { parseNumeric } from '@weatherteam6/types'
import type { ApiResponse, Location } from '@weatherteam6/types'

export const locationsRouter = Router()

type LocationRow = typeof locations.$inferSelect

function mapLocation(row: LocationRow): Location {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    lat: parseFloat(row.lat),
    lon: parseFloat(row.lon),
    is_climbing_location: row.is_climbing_location,
    rock_type: row.rock_type ?? null,
    aspect: row.aspect,
    cliff_angle: parseNumeric(row.cliff_angle),
    asos_station: row.asos_station,
    asos_network: row.asos_network,
    nws_office: row.nws_office,
    nws_grid_x: row.nws_grid_x,
    nws_grid_y: row.nws_grid_y,
    timezone: row.timezone,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at?.toISOString() ?? null,
  }
}

locationsRouter.get('/locations', async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(locations).where(eq(locations.user_id, req.userId))
    const response: ApiResponse<Location[]> = { data: rows.map(mapLocation), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const response: ApiResponse<null> = { data: null, error: message, status: 500 }
    res.status(500).json(response)
  }
})

locationsRouter.get('/locations/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id ?? ''
    const rows = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.user_id, req.userId)))
    const row = rows[0]
    if (!row) {
      const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
      res.status(404).json(response)
      return
    }
    const response: ApiResponse<Location> = { data: mapLocation(row), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const response: ApiResponse<null> = { data: null, error: message, status: 500 }
    res.status(500).json(response)
  }
})
