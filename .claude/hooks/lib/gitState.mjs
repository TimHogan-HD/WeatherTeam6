/**
 * Shared git/gh state readers for the hooks.
 *
 * Every call is timeout-bounded and returns a neutral value on failure. A hook
 * that throws or hangs is worse than one that does not fire: the Stop hook runs
 * on every turn, and `gh` can be slow, unauthenticated, or offline.
 */

import { execFileSync } from 'node:child_process'

const GIT_TIMEOUT_MS = 5000
const GH_TIMEOUT_MS = 10000

/** Run a command and return trimmed stdout, or `null` on any failure. */
function tryRun(file, args, timeout) {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim()
  } catch {
    return null
  }
}

export function git(args) {
  return tryRun('git', args, GIT_TIMEOUT_MS)
}

/**
 * `gh` is installed on this machine but is not always on PATH — CLAUDE.md
 * records the full path. Try the bare name first, then the known location.
 */
export function gh(args) {
  const direct = tryRun('gh', args, GH_TIMEOUT_MS)
  if (direct !== null) return direct
  return tryRun('C:\\Program Files\\GitHub CLI\\gh.exe', args, GH_TIMEOUT_MS)
}

export function isGitRepo() {
  return git(['rev-parse', '--is-inside-work-tree']) === 'true'
}

export function currentBranch() {
  const b = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  // Detached HEAD reports "HEAD"; treat it as no branch.
  return b && b !== 'HEAD' ? b : null
}

/**
 * The repository's default branch. Read from the remote HEAD ref rather than
 * assumed, so this does not silently do the wrong thing on a repo using
 * `master` or `develop`.
 */
export function defaultBranch() {
  const ref = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])
  if (ref) return ref.replace('refs/remotes/origin/', '')
  // Fall back only if origin/HEAD is not set locally.
  if (git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'])) return 'main'
  if (git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/master'])) return 'master'
  return null
}

export function hasRemote() {
  return Boolean(git(['remote']))
}

/** Tracked modifications, staged changes, and untracked non-ignored files. */
export function workingTreeChanges() {
  const out = git(['status', '--porcelain=v1', '--untracked-files=normal'])
  if (!out) return []
  return out.split(/\r?\n/).filter(Boolean)
}

/** Commits on the current branch that are not on its upstream. */
export function unpushedCommits() {
  const branch = currentBranch()
  if (!branch) return []
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (!upstream) {
    // No upstream at all. Compare against the default branch instead, so a
    // never-pushed feature branch still counts as outstanding work.
    const base = defaultBranch()
    if (!base) return []
    const out = git(['log', `origin/${base}..HEAD`, '--oneline'])
    return out ? out.split(/\r?\n/).filter(Boolean) : []
  }
  const out = git(['log', `${upstream}..HEAD`, '--oneline'])
  return out ? out.split(/\r?\n/).filter(Boolean) : []
}

/** Open PRs, as [{number, title, headRefName, mergeable, reviewDecision, state}]. */
export function openPullRequests() {
  const raw = gh([
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,headRefName,mergeable,statusCheckRollup',
  ])
  if (!raw) return null // gh unavailable — caller must not treat this as "none".
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** True when every completed check on the PR succeeded and none is pending. */
export function checksArePassing(pr) {
  const rollup = pr?.statusCheckRollup
  if (!Array.isArray(rollup) || rollup.length === 0) return false
  for (const check of rollup) {
    const status = check.status ?? check.state ?? ''
    const conclusion = check.conclusion ?? check.state ?? ''
    if (status && status !== 'COMPLETED') return false
    if (!['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(String(conclusion).toUpperCase())) {
      return false
    }
  }
  return true
}
