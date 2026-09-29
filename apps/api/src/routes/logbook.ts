import { Router, type Request, type Response } from 'express'
import type { ApiResponse, Logbook, RouteTick } from '@weatherteam6/types'
import { isUuid, sendServerError } from '../lib/http.js'
import { routeExists } from '../lib/guidebook/guidebook.js'
import { parseTickInput } from '../lib/logbook/parseLogbook.js'
import { addTodo, createTick, deleteTick, logbookFor, removeTodo } from '../lib/logbook/logbook.js'

export const logbookRouter = Router()

function refuse(res: Response, status: number, error: string): void {
  const response: ApiResponse<null> = { data: null, error, status }
  res.status(status).json(response)
}

function ok(res: Response): void {
  const response: ApiResponse<null> = { data: null, error: null, status: 200 }
  res.status(200).json(response)
}

logbookRouter.get('/logbook', async (req: Request, res: Response) => {
  try {
    const response: ApiResponse<Logbook> = { data: await logbookFor(req.userId), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /logbook')
  }
})

logbookRouter.post('/logbook/ticks', async (req: Request, res: Response) => {
  const parsed = parseTickInput(req.body, Date.now())
  if ('error' in parsed) {
    refuse(res, 400, parsed.error)
    return
  }
  if (!routeExists(parsed.route_id)) {
    refuse(res, 404, 'Route not found')
    return
  }
  try {
    const response: ApiResponse<RouteTick> = { data: await createTick(req.userId, parsed), error: null, status: 201 }
    res.status(201).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /logbook/ticks')
  }
})

logbookRouter.delete('/logbook/ticks/:tickId', async (req: Request, res: Response) => {
  const id = req.params['tickId']
  if (!id || !isUuid(id)) {
    refuse(res, 404, 'Tick not found')
    return
  }
  try {
    // Another user's tick is the same 404 as a missing one, never a 403.
    if (!(await deleteTick(req.userId, id))) {
      refuse(res, 404, 'Tick not found')
      return
    }
    ok(res)
  } catch (err) {
    sendServerError(res, err, 'DELETE /logbook/ticks/:tickId')
  }
})

logbookRouter.put('/logbook/todos/:routeId', async (req: Request, res: Response) => {
  const routeId = req.params['routeId']
  if (!routeId || !routeExists(routeId)) {
    refuse(res, 404, 'Route not found')
    return
  }
  try {
    await addTodo(req.userId, routeId)
    ok(res)
  } catch (err) {
    sendServerError(res, err, 'PUT /logbook/todos/:routeId')
  }
})

logbookRouter.delete('/logbook/todos/:routeId', async (req: Request, res: Response) => {
  const routeId = req.params['routeId']
  if (!routeId) {
    refuse(res, 404, 'Route not found')
    return
  }
  try {
    // No snapshot check: a to-do left behind by a route a re-pull dropped
    // must still be removable.
    await removeTodo(req.userId, routeId)
    ok(res)
  } catch (err) {
    sendServerError(res, err, 'DELETE /logbook/todos/:routeId')
  }
})
