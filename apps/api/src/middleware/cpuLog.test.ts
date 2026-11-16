import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { cpuLogMiddleware, type CpuSample } from './cpuLog.js'

let server: Server | null = null

afterEach(() => {
  server?.close()
  server = null
})

/**
 * Burn `ms` of process CPU on the event loop, so a request has a known minimum cost.
 * Counted in CPU time, not wall time: a loaded runner can deschedule the process mid-spin,
 * and a wall-clock spin then costs less CPU than the assertion expects (#602).
 */
function spin(ms: number): void {
  const start = process.cpuUsage()
  for (;;) {
    const { user, system } = process.cpuUsage(start)
    if ((user + system) / 1000 >= ms) return
  }
}

async function start(): Promise<{ base: string; samples: CpuSample[] }> {
  const samples: CpuSample[] = []
  const app = express()
  app.use(cpuLogMiddleware((s) => samples.push(s)))
  app.get('/busy', (_req, res) => {
    spin(40)
    res.json({ ok: true })
  })
  app.get('/slow', (_req, res) => {
    setTimeout(() => res.json({ ok: true }), 150)
  })
  app.get('/fast', (_req, res) => {
    res.json({ ok: true })
  })
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve)
  })
  const { port } = server!.address() as AddressInfo
  return { base: `http://127.0.0.1:${port}`, samples }
}

/** The log is written on 'close', which can land just after the client has its response. */
async function settled(samples: CpuSample[], n: number): Promise<void> {
  for (let i = 0; i < 50 && samples.length < n; i++) await new Promise((r) => setTimeout(r, 10))
  expect(samples).toHaveLength(n)
}

describe('cpuLogMiddleware', () => {
  it('reports start-up CPU on the first request only', async () => {
    const { base, samples } = await start()
    await fetch(`${base}/fast`)
    await settled(samples, 1)
    await fetch(`${base}/fast`)
    await settled(samples, 2)

    expect(samples[0]!.cold).toBe(true)
    expect(samples[0]!.initCpuMs).toBeGreaterThan(0)
    expect(samples[1]!.cold).toBe(false)
    expect(samples[1]!.initCpuMs).toBeNull()
  })

  it("counts the handler's own CPU, not the wall time it waited", async () => {
    const { base, samples } = await start()
    await fetch(`${base}/busy`)
    await fetch(`${base}/slow`)
    await settled(samples, 2)

    const busy = samples.find((s) => s.path === '/busy')!
    const slow = samples.find((s) => s.path === '/slow')!
    expect(busy.cpuMs).toBeGreaterThanOrEqual(30)
    expect(slow.wallMs).toBeGreaterThanOrEqual(140)
    expect(slow.cpuMs).toBeLessThan(slow.wallMs)
    expect(busy.overlapped).toBe(false)
    expect(slow.overlapped).toBe(false)
  })

  it('marks both requests overlapped when one arrives while another runs', async () => {
    const { base, samples } = await start()
    const slow = fetch(`${base}/slow`)
    await new Promise((r) => setTimeout(r, 30))
    await fetch(`${base}/fast`)
    await slow
    await settled(samples, 2)

    expect(samples.every((s) => s.overlapped)).toBe(true)
  })

  it('logs the path without its query string, and the status', async () => {
    const { base, samples } = await start()
    await fetch(`${base}/fast?lat=44.56&lon=-92.53`)
    await fetch(`${base}/missing`)
    await settled(samples, 2)

    expect(samples[0]!.path).toBe('/fast')
    expect(samples[1]).toMatchObject({ path: '/missing', status: 404, method: 'GET' })
  })
})
