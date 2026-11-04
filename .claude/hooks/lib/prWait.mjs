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

/**
 * The commands a session runs to land a PR, local first and cloud second.
 * Cloud sessions are refused GraphQL (HTTP 403), and `gh pr ready`,
 * `gh pr merge` and `gh pr update-branch` are GraphQL, so every one of them
 * failed there while the hooks kept naming them (2026-11-04). The GitHub MCP
 * tools and REST work in both.
 */
export const LAND = {
  ready: (n) =>
    `mark it ready: gh pr ready ${n}  (cloud: the GitHub MCP tool update_pull_request with draft: false)`,
  arm: (n) =>
    `arm auto-merge: gh pr merge ${n} --auto --squash --delete-branch  (cloud: the GitHub MCP tool enable_pr_auto_merge, mergeMethod SQUASH)`,
  merge: (n) =>
    `merge it: gh api -X PUT repos/{owner}/{repo}/pulls/${n}/merge -f merge_method=squash  (or the GitHub MCP tool merge_pull_request, merge_method squash)`,
  update: (n) => `bring main in: gh api -X PUT repos/{owner}/{repo}/pulls/${n}/update-branch`,
}

/** What a failed `review` check means since it gates on blocking findings. */
const REVIEW_FAILED =
  ' A failed review means blocking findings or no verdict: read the newest "## Claude review" comment and its inline comments, ' +
  'then fix and push, or reply on the inline comment showing why it is not a defect and re-run the job (gh run rerun <id>).'

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
 * `{ merged, open, number, draft, autoMerge, autoMergeAllowed (true|false|null),
 *    headSha, startSha, mergeable (true|false|null), mergeableState, checks[],
 *    reviewed, exempt, findings, elapsedMs }`.
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
    const review = failed.some((c) => (c.name ?? c.context) === 'review') ? REVIEW_FAILED : ''
    return {
      outcome: 'ci-failed',
      code: 4,
      message: `Failed: ${names(failed)}. Read the log (gh run view --log-failed), fix, push, and wait again.${review}`,
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
  const n = snap.number ?? '<n>'
  if (pending.length > 0) return null
  // Armed and green: GitHub is merging it, and the next poll reads `merged`. A
  // wait run in the background must outlast this, or a red check after arming
  // would wake nobody.
  if (snap.autoMerge && !snap.draft && snap.mergeableState !== 'behind') return null
  // 2026-11-04: a draft used to reach no-review, whose rerun advice re-ran a job
  // that skipped drafts again. Drafts are reviewed now; a green one only needs marking ready.
  if (snap.draft) {
    return {
      outcome: 'draft',
      code: 12,
      message: `Green, but a draft, so it cannot merge. If it is finished, ${LAND.ready(n)}, then ${snap.autoMergeAllowed === true ? LAND.arm(n) : LAND.merge(n)}.`,
    }
  }
  if (!snap.reviewed && !snap.exempt) {
    return {
      outcome: 'no-review',
      code: 6,
      message:
        'Every check passed, but the reviewer posted no "## Claude review" summary naming the head commit, so the required review check cannot have passed on it. ' +
        'Rerun it: gh run list --workflow "Claude Review" --limit 3, then gh run rerun <id>.',
    }
  }
  if (snap.mergeableState === 'behind') {
    return {
      outcome: 'behind',
      code: 5,
      message: `Green and reviewed, but main has moved and branch protection needs the branch up to date. ${LAND.update(n)}, then wait again.`,
    }
  }
  if (snap.mergeable === null) return null // GitHub is still computing it
  const findings =
    snap.findings > 0
      ? ` The reviewer left ${snap.findings} inline comment(s) on this commit; the blocking ones already failed the check, so these are advisory: fix each that is right in this PR or reply why not.`
      : ''
  return {
    outcome: 'ready',
    code: 0,
    message: `Green, reviewed at the head commit, and mergeable.${findings} Then ${snap.autoMergeAllowed === true ? LAND.arm(n) : LAND.merge(n)}.`,
  }
}

/**
 * The checks branch protection requires, from `checks`. A slow check nothing
 * requires (the 10-minute UI check, 2026-10-21) must not hold a merge or a
 * wait. `required` null (protection unreadable) or empty keeps every check, so
 * an unreadable rule waits on more, never less.
 */
export function onlyRequired(checks, required) {
  if (!Array.isArray(checks) || !Array.isArray(required) || required.length === 0) return checks
  return checks.filter((c) => required.includes(c?.name ?? c?.context))
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
 * The open PRs the Stop hook's merge checks may hold a turn for: only the
 * session's own branch's, and never a draft (`ownPrVerdict` handles the own
 * draft). Owner, 2026-11-03: a PR unrelated to the chat must not prompt at
 * all. A draft another session left open had blocked a stop more than twenty
 * times, and blocking once still told a session to merge another's live PR.
 */
export function prsToFinish({ prs, branch }) {
  return prs.filter((p) => p.isDraft !== true && p.headRefName === branch)
}

/**
 * The Stop hook's verdict on the open PR for the session's own branch, from
 * `gh pr list`'s shape (`mergeable`, `statusCheckRollup`, `isDraft`,
 * `autoMerge`). Returns block lines, or `null` to leave the turn to the hook's
 * other checks.
 *
 * With auto-merge allowed (owner, 2026-11-04) the turn ends once the PR is
 * armed: GitHub merges when `ci` and `review` pass, so nothing is left for
 * the session to hold the turn for. A failure on an armed PR still blocks
 * once, because GitHub will never merge it.
 *
 * - Armed, checks done: allowed (GitHub is merging it).
 * - Armed, checks pending: allowed in a cloud session, whose PR subscription
 *   wakes it on a red check; locally only with a `wait:pr` in the background,
 *   or nothing would tell the session that GitHub will never merge it. Blocked
 *   once otherwise.
 * - A draft: blocked once. Mark it ready and arm it, or say why it stays a draft.
 * - Not armed, auto-merge allowed: blocked once, naming the command to arm it.
 *
 * Auto-merge not allowed or unreadable keeps the older rules:
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
export function ownPrVerdict({ pr, backgroundTasks, stopHookActive, autoMergeAllowed = null, cloud = false }) {
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
      'Merge origin/main into the branch, resolve, and push, then wait for CI and the review:',
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
  if (pr.autoMerge === true) {
    if (pending.length === 0 || cloud || stopHookActive) return null
    if (!Array.isArray(backgroundTasks) || waiterRunning(backgroundTasks)) return null
    return [
      `UNFINISHED: ${head} is armed to auto-merge but ${pending.map((c) => c.name ?? c.context ?? 'unnamed').join(', ') || 'its checks'} are still running, and nothing will tell you if one fails.`,
      '',
      `Run ${WAIT_COMMAND} in the background (run_in_background) before ending the turn: its exit wakes you on a red check.`,
    ]
  }
  if (pr.isDraft === true) {
    if (stopHookActive) return null
    return [
      `UNFINISHED: ${head} is a draft, so it cannot merge.`,
      '',
      `If the work is finished, ${LAND.ready(pr.number)}, then ${autoMergeAllowed === true ? LAND.arm(pr.number) : 'wait for CI and the review and merge it'}.`,
      'If it stays a draft on purpose (the owner asked, or it is unfinished), say so in the reply.',
    ]
  }
  if (autoMergeAllowed === true) {
    if (stopHookActive) return null
    return [
      `UNFINISHED: ${head} is open and auto-merge is not armed, so nothing will merge it.`,
      '',
      `Read the reviewer's findings once it has posted, then ${LAND.arm(pr.number)}.`,
      'Once it is armed you may end the turn: GitHub merges when ci and review pass, and a failure wakes you',
      `(a PR webhook in the cloud; locally, ${WAIT_COMMAND} run in the background).`,
      `If GitHub refuses to arm it because it is already mergeable (every check green), ${LAND.merge(pr.number)}.`,
      'If arming fails for any other reason, say what it printed in the reply.',
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
    'It prints one outcome: merged, ready, draft, ci-failed, no-review, conflict, behind, no-checks, head-changed or timeout. Act on it, then merge.',
    'Only if a job is hung and the owner must step in: say so, and touch .claude/.wip.',
  ]
}
