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
function tryRun(file, args, timeout, cwd) {
  try {
    return execFileSync(file, args, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim()
  } catch {
    return null
  }
}

/** `cwd` defaults to the hook's own directory; pass one to read another checkout. */
export function git(args, cwd) {
  return tryRun('git', args, GIT_TIMEOUT_MS, cwd)
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

export function isGitRepo(cwd) {
  return git(['rev-parse', '--is-inside-work-tree'], cwd) === 'true'
}

export function currentBranch(cwd) {
  const b = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  // Detached HEAD reports "HEAD"; treat it as no branch.
  return b && b !== 'HEAD' ? b : null
}

/**
 * The repository's default branch. Read from the remote HEAD ref rather than
 * assumed, so this does not silently do the wrong thing on a repo using
 * `master` or `develop`.
 */
export function defaultBranch(cwd) {
  const ref = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd)
  if (ref) return ref.replace('refs/remotes/origin/', '')
  // Fall back only if origin/HEAD is not set locally.
  if (git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'], cwd)) return 'main'
  if (git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/master'], cwd)) return 'master'
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

/** `gh api <path>` parsed as JSON, or `null` on any failure. */
export function ghApi(path) {
  const raw = gh(['api', path])
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Open PRs, as [{number, title, headRefName, mergeable, statusCheckRollup}].
 *
 * `gh pr list` is GraphQL, which cloud sessions are refused (HTTP 403), so on
 * 2026-10-07 every gh-backed check here had been silently off in them. REST is
 * the fallback: the same shape from `pulls`, `pulls/<n>` (the list endpoint
 * omits `mergeable`), and the head commit's check runs and statuses.
 */
export function openPullRequests() {
  const raw = gh([
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,headRefName,mergeable,statusCheckRollup',
  ])
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return openPullRequestsRest()
}

function openPullRequestsRest() {
  const list = ghApi('repos/{owner}/{repo}/pulls?state=open&per_page=50')
  if (!Array.isArray(list)) return null // unreadable — never "none"
  const out = []
  for (const p of list) {
    const detail = ghApi(`repos/{owner}/{repo}/pulls/${p.number}`)
    const runs = ghApi(`repos/{owner}/{repo}/commits/${p.head?.sha}/check-runs?per_page=100`)
    const status = ghApi(`repos/{owner}/{repo}/commits/${p.head?.sha}/status`)
    if (!detail || !runs || !status) return null
    const rollup = [
      ...(runs.check_runs ?? []).map((r) => ({
        status: String(r.status ?? '').toUpperCase(),
        conclusion: String(r.conclusion ?? '').toUpperCase(),
      })),
      ...(status.statuses ?? []).map((s) => ({ state: String(s.state ?? '').toUpperCase() })),
    ]
    out.push({
      number: p.number,
      title: p.title,
      headRefName: p.head?.ref,
      mergeable: detail.mergeable === true ? 'MERGEABLE' : detail.mergeable === false ? 'CONFLICTING' : 'UNKNOWN',
      statusCheckRollup: rollup,
    })
  }
  return out
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
