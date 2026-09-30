import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Vercel's Hobby plan allows 100 deployments a day across both projects, and
 * on 2026-09-30 a morning of PRs spent all of them — 59 on previews nobody
 * opens (they sit behind Vercel SSO) and most of the rest rebuilding the
 * project a change did not touch — so the last fix of the day could not ship.
 *
 * Both projects therefore deploy from `main` only, and each skips a build when
 * nothing it is built from changed since its last deployment. A git error
 * (an unknown previous SHA in a shallow clone) exits non-zero, which builds:
 * the failure direction is a spent deployment, never a missed release.
 */
const APPS = ['api', 'miniapp'] as const

type VercelJson = {
  git?: { deploymentEnabled?: Record<string, boolean> }
  ignoreCommand?: string
}

function config(app: (typeof APPS)[number]): VercelJson {
  const path = fileURLToPath(new URL(`../../${app}/vercel.json`, import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as VercelJson
}

describe('the Vercel deployment budget', () => {
  it.each(APPS)('%s deploys from main and from no other branch', (app) => {
    const enabled = config(app).git?.deploymentEnabled
    expect(enabled?.main).toBe(true)
    expect(enabled?.['*']).toBe(false)
    // `*` stops at a slash, and every branch here is `fix/…` or `feat/…`.
    expect(enabled?.['**']).toBe(false)
  })

  it.each(APPS)('%s skips a build when nothing it is built from changed', (app) => {
    const cmd = config(app).ignoreCommand ?? ''
    expect(cmd).toContain('git diff --quiet')
    expect(cmd).toContain('VERCEL_GIT_PREVIOUS_SHA')
    // Its own directory, the shared packages, and the root manifests that pin
    // versions (the root `vite` pin among them).
    for (const path of [' . ', '../../packages', '../../package.json', '../../package-lock.json']) {
      expect(cmd).toContain(path)
    }
  })
})
