/**
 * What a PR is waiting on, shared by `wait-pr.mjs` and the Stop hook.
 *
 * Written 2026-10-21. The Stop hook blocked a PR only once it was green and
 * reviewed, so a turn could end while CI or the reviewer was still running, and
 * the owner had to ask "done?" or "merge?" in session after session. CI and the
 * reviewer take about two minutes each; there is nothing to hand back.
 *
 * Pure: every input is passed in, so `check-hooks.mjs` covers each outcome
 * without GitHub.
 */

const PASSING = ['SUCCESS', 'NEUTRAL', 'SKIPPED']

/** Shell-task status values that mean the task has stopped. */
const STOPPED = ['completed', 'failed', 'killed', 'stopped', 'error', 'cancelled']

/** How long a PR may show no checks before that is the answer rather than a delay. */
export const NO_CHECKS_GRACE_MS = 3 * 60_000

export const WAIT_COMMAND = 'npm run wait:pr'

const upper = (v) => String(v ?? '').toUpperCase()

/** A check is `{ name?, status?, conclusion?, state? }` — GraphQL rollup or REST. */
export function checkFailed(check) {
  const status = upper(check?.status ?? check?.state)
  const conclusion = upper(check?.conclusion ?? check?.state)
  if (check?.state !== undefined && check?.status === undefined) {
    // A commit status: PENDING, SUCCESS, FAILURE or ERROR.
    return conclusion === 'FAILURE' || conclusion === 'ERROR'
  }
  return status === 'COMPLETED' && !PASSING.includes(conclusion)
}

export function checkPending(check) {
  if (check?.state !== undefined && check?.status === undefined) return upper(check.state) === 'PENDING'
  return upper(check?.status) !== 'COMPLETED'
}

/**
 * One poll of `wait-pr.mjs`, decided. `snap`:
 * `{ merged, open, headSha, startSha, mergeable (true|false|null), mergeableState,
 *    checks[], reviewed, exempt, findings, elapsedMs }`.
 * Returns `null` while still waiting, else `{ outcome, code, message }`.
 */
export function classifyPr(snap) {
  const failed = snap.checks.filter(checkFailed)
  const pending = snap.checks.filter((c) => !checkFailed(c) && checkPending(c))
  const names = (list) => list.map((c) => c.name ?? c.context ?? 'unnamed').join(', ')

  if (snap.merged) return { outcome: 'merged', code: 0, message: 'The PR is already merged.' }
  if (!snap.open) return { outcome: 'closed', code: 9, message: 'The PR is closed without merging.' }
  if (snap.startSha && snap.headSha !== snap.startSha) {
    return {
      outcome: 'head-changed',
      code: 8,
      message: `The head moved from ${snap.startSha.slice(0, 7)} to ${snap.headSha.slice(0, 7)}. Run ${WAIT_COMMAND} again.`,
    }
  }
  if (snap.mergeable === false || snap.mergeableState === 'dirty') {
    return {
      outcome: 'conflict',
      code: 3,
      message: 'The PR conflicts with main, so GitHub runs no checks on it. Rebase onto origin/main, push, and wait again.',
    }
  }
  if (failed.length > 0) {
    return {
      outcome: 'ci-failed',
      code: 4,
      message: `Failed: ${names(failed)}. Read the log (gh run view --log-failed), fix, push, and wait again.`,
    }
  }
  if (snap.checks.length === 0) {
    if (snap.elapsedMs < NO_CHECKS_GRACE_MS) return null
    return {
      outcome: 'no-checks',
      code: 7,
      message: 'No checks have reported on the head commit after three minutes. Check that the workflows ran (gh run list --limit 5).',
    }
  }
  if (pending.length > 0) return null
  if (!snap.reviewed && !snap.exempt) {
    return {
      outcome: 'no-review',
      code: 6,
      message:
        'Every check passed, but the reviewer posted no "## Claude review" summary naming the head commit, so the merge gate will refuse. ' +
        'Rerun it: gh run list --workflow "Claude Review" --limit 3, then gh run rerun <id>.',
    }
  }
  if (snap.mergeableState === 'behind') {
    return {
      outcome: 'behind',
      code: 5,
      message: 'Green and reviewed, but main has moved and branch protection needs the branch up to date. Run gh pr update-branch, then wait again.',
    }
  }
  if (snap.mergeable === null) return null // GitHub is still computing it
  const findings =
    snap.findings > 0
      ? ` The reviewer left ${snap.findings} inline comment(s) on this commit: read each and fix it or reply why it is not a defect before merging.`
      : ''
  return {
    outcome: 'ready',
    code: 0,
    message: `Green, reviewed at the head commit, and mergeable.${findings} Then: gh pr merge <n> --squash --delete-branch.`,
  }
}

/** True when a still-running background shell task is a `wait:pr` run. */
export function waiterRunning(backgroundTasks) {
  if (!Array.isArray(backgroundTasks)) return false
  return backgroundTasks.some(
    (t) =>
      /wait:pr|wait-pr\.mjs/.test(String(t?.command ?? t?.description ?? '')) &&
      !STOPPED.includes(String(t?.status ?? '').toLowerCase()),
  )
}

/**
 * The Stop hook's verdict on the open PR for the session's own branch, from
 * `gh pr list`'s shape (`mergeable`, `statusCheckRollup`). Returns block lines,
 * or `null` to leave the turn to the hook's other checks.
 *
 * - Pending with a `wait:pr` running in the background: allowed, because its
 *   exit wakes the session.
 * - Pending with nothing running: blocked every time. The fix is a tool call,
 *   which resets Claude Code's 8-block cap, so this cannot deadlock.
 * - `backgroundTasks` absent (a Claude Code older than 2.1.145): blocked once
 *   (`stopHookActive` false), since the hook cannot see a waiter.
 * - Conflicting or failed: blocked once. Stopping to tell the owner why is
 *   sometimes right; stopping without a word is not.
 */
export function ownPrVerdict({ pr, backgroundTasks, stopHookActive }) {
  if (!pr) return null
  const rollup = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : []
  const failed = rollup.filter(checkFailed)
  const pending = rollup.filter((c) => !checkFailed(c) && checkPending(c))
  const head = `#${pr.number}  ${pr.title}`

  if (pr.mergeable === 'CONFLICTING') {
    if (stopHookActive) return null
    return [
      `UNFINISHED: ${head} conflicts with main, so GitHub will run no checks on it and it can never go green.`,
      '',
      'Rebase onto origin/main and push, then wait for CI and the review:',
      `  ${WAIT_COMMAND}   (foreground, timeout 600000)`,
      'If you are stopping to ask the owner something, say so in the reply.',
    ]
  }
  if (failed.length > 0) {
    if (stopHookActive) return null
    return [
      `UNFINISHED: ${head} has failing checks: ${failed.map((c) => c.name ?? c.context ?? 'unnamed').join(', ')}.`,
      '',
      'Read the log (gh run view --log-failed), fix, push, and wait again with',
      `  ${WAIT_COMMAND}   (foreground, timeout 600000)`,
      'If you are stopping to ask the owner something, say so in the reply.',
    ]
  }
  if (pending.length === 0 && rollup.length > 0) return null // green: the hook's merge checks take it
  if (waiterRunning(backgroundTasks)) return null
  if (!Array.isArray(backgroundTasks) && stopHookActive) return null
  return [
    `UNFINISHED: ${head} is waiting on ${pending.length > 0 ? pending.map((c) => c.name ?? c.context ?? 'unnamed').join(', ') : 'checks that have not started yet'}, and nothing is running that will tell you when it finishes.`,
    '',
    'Do not hand this back with "I\'ll merge when it\'s green". CI and the review take about two minutes. Wait for them:',
    `  ${WAIT_COMMAND}   (foreground, timeout 600000; or run_in_background, whose exit wakes you)`,
    'It prints one outcome: ready, ci-failed, no-review, conflict, behind, no-checks, head-changed or timeout. Act on it, then merge.',
    'Only if a job is hung and the owner must step in: say so, and touch .claude/.wip.',
  ]
}
