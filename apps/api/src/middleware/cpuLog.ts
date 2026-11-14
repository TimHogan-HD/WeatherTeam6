import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * **What one request cost in CPU, logged per request** — the measurement behind
 * the Vercel Fluid "Active CPU" bill.
 *
 * The Hobby team was paused on 2026-11-14 after using its 4 h a month, about
 * 8 min a day, all of it this function. Vercel's per-route observability is
 * not available on our plan, so this line is how the cost is split between the
 * cron jobs, the screens and start-up.
 *
 * - `cpuMs` is the process's user + system CPU from the request's arrival to
 *   its response closing, `wallMs` the elapsed time.
 * - `cold` marks the first request this instance served, and only then
 *   `initCpuMs` is the CPU the process spent before it: runtime boot and
 *   importing the app. That is start-up, which a warm request does not pay.
 * - **`overlapped` is true when another request ran at any moment of this
 *   one.** Fluid serves concurrent requests from one process, and process CPU
 *   cannot be split between them, so an overlapped `cpuMs` counts the other
 *   request's work too. Sum only the non-overlapped ones per route, or treat
 *   overlapped ones as an upper bound.
 *
 * The path is logged without its query string, which can carry coordinates.
 */
export type CpuSample = {
  readonly method: string
  readonly path: string
  readonly status: number
  readonly cpuMs: number
  readonly wallMs: number
  readonly cold: boolean
  readonly initCpuMs: number | null
  readonly overlapped: boolean
}

function totalMs(usage: NodeJS.CpuUsage): number {
  return Math.round((usage.user + usage.system) / 1000)
}

/**
 * One middleware per app instance; its counters are per instance, as Fluid's
 * are. Mount it first so its window covers every other middleware.
 */
export function cpuLogMiddleware(log: (sample: CpuSample) => void): RequestHandler {
  let served = 0
  // Each in-flight request's overlap flag, so a request starting can mark
  // every request already running, and be marked by them.
  const active = new Set<{ overlapped: boolean }>()

  return (req: Request, res: Response, next: NextFunction) => {
    const cold = served === 0
    served++
    const initCpuMs = cold ? totalMs(process.cpuUsage()) : null
    const startCpu = process.cpuUsage()
    const startWall = performance.now()

    const self = { overlapped: active.size > 0 }
    for (const other of active) other.overlapped = true
    active.add(self)

    // 'close' fires once for every response, finished or aborted.
    res.once('close', () => {
      active.delete(self)
      log({
        method: req.method,
        path: req.originalUrl.split('?')[0] ?? '',
        status: res.statusCode,
        cpuMs: totalMs(process.cpuUsage(startCpu)),
        wallMs: Math.round(performance.now() - startWall),
        cold,
        initCpuMs,
        overlapped: self.overlapped,
      })
    })
    next()
  }
}
