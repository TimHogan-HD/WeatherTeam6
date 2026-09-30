/**
 * Which Claude session edited which files in this checkout.
 *
 * On 2026-09-30 two sessions shared one working tree. One switched branches
 * between two of the other's commands, so a commit landed on the wrong branch,
 * and the Stop hook then blocked the other session ~30 times over files it had
 * never touched. The real fix is one worktree per session; this is how the
 * hooks notice when that has not happened.
 *
 * Each session keeps one file under the checkout's own git dir (so a worktree
 * has its own set, and nothing is committed): `claude-sessions/<actor>`,
 * one repo-relative path per line for every file it wrote through
 * Edit/Write/NotebookEdit. Its mtime is the session's last tool call. Edits made
 * through a shell are not recorded, so a file nobody claims is treated as the
 * current session's. That keeps the Stop hook strict wherever the record is
 * silent.
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { git } from './gitState.mjs'

/** A session silent for longer than this is treated as gone. */
export const ACTIVE_MINUTES = 30
const PRUNE_AFTER_MS = 24 * 3_600_000

const normalise = (p) => {
  const slashed = p.replace(/\\/g, '/')
  return process.platform === 'win32' ? slashed.toLowerCase() : slashed
}

/**
 * Who is acting. `CLAUDE_PID` names the Claude Code process, which survives
 * `/clear` (a new session id in the same window, the same work) and tells two
 * windows apart. The session id is the fallback where it is not set.
 */
function actorKey(sessionId) {
  const pid = Number(process.env.CLAUDE_PID)
  if (Number.isInteger(pid) && pid > 0) return `pid-${pid}`
  return typeof sessionId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(sessionId) ? sessionId : null
}

/** A process-keyed actor whose process has exited is gone, however recent. */
function stillRunning(key) {
  const m = /^pid-(\d+)$/.exec(key)
  if (!m) return true
  try {
    process.kill(Number(m[1]), 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

function checkout(cwd) {
  const out = git(['rev-parse', '--absolute-git-dir', '--show-toplevel'], cwd)
  if (!out) return null
  const [gitDir, top] = out.split(/\r?\n/)
  if (!gitDir || !top) return null
  return { dir: join(gitDir, 'claude-sessions'), top }
}

/**
 * Note that `sessionId` just made a tool call in `cwd`, and that it wrote
 * `filePath` if one is given. Never throws: a hook must not fail a tool call
 * over bookkeeping.
 */
export function recordToolUse(sessionId, filePath, cwd) {
  try {
    const id = actorKey(sessionId)
    const where = id && checkout(cwd)
    if (!where) return
    mkdirSync(where.dir, { recursive: true })
    const file = join(where.dir, id)
    let line = ''
    if (typeof filePath === 'string' && filePath) {
      const abs = isAbsolute(filePath) ? filePath : resolve(cwd ?? process.cwd(), filePath)
      const rel = relative(where.top, abs)
      if (rel && !rel.startsWith('..') && !isAbsolute(rel)) line = normalise(rel) + '\n'
    }
    appendFileSync(file, line)
    const now = new Date()
    utimesSync(file, now, now)
    for (const other of readdirSync(where.dir)) {
      const p = join(where.dir, other)
      if (Date.now() - statSync(p).mtimeMs > PRUNE_AFTER_MS) rmSync(p, { force: true })
    }
  } catch {
    // Bookkeeping only.
  }
}

/**
 * Other sessions that made a tool call in this checkout within ACTIVE_MINUTES,
 * each with the files it claims. `sessionId` may be absent, in which case every
 * recent session counts as another one.
 */
export function activePeers(sessionId, cwd) {
  try {
    const where = checkout(cwd)
    if (!where) return []
    const me = actorKey(sessionId)
    const peers = []
    for (const id of readdirSync(where.dir)) {
      if (id === me) continue
      const p = join(where.dir, id)
      const minutesAgo = (Date.now() - statSync(p).mtimeMs) / 60_000
      if (minutesAgo > ACTIVE_MINUTES || !stillRunning(id)) continue
      const files = new Set(readFileSync(p, 'utf8').split('\n').filter(Boolean))
      peers.push({ id, minutesAgo: Math.round(minutesAgo), files })
    }
    return peers
  } catch {
    return []
  }
}

/** The path in one `git status --porcelain=v1` line, normalised like a claim. */
export function porcelainPath(line) {
  let p = line.slice(3)
  const arrow = p.indexOf(' -> ')
  if (arrow !== -1) p = p.slice(arrow + 4)
  return normalise(p.replace(/^"(.*)"$/, '$1'))
}
