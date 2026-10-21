#!/usr/bin/env node
/**
 * Wait for a PR's CI and Claude review, then print one outcome and exit.
 *
 *   npm run wait:pr                 the current branch's PR
 *   npm run wait:pr -- 381          a numbered PR
 *   npm run wait:pr -- --timeout-min 20
 *
 * Exists because the shell refuses a foreground `sleep`, and a session that
 * cannot wait ends its turn and leaves the owner to ask "done?" (2026-10-21).
 * Node's own timer is not a `sleep` command. The default cap, 9 minutes, fits
 * inside a 600000 ms foreground Bash call; run in the background, its exit
 * wakes the session instead.
 *
 * Reads GitHub over REST only (GraphQL is refused in cloud sessions). Exit
 * codes: 0 ready or merged, 3 conflict, 4 ci-failed, 5 behind, 6 no-review,
 * 7 no-checks, 8 head-changed, 9 closed, 10 timeout, 11 GitHub unreadable.
 * The logic is `lib/prWait.mjs`, which `check:hooks` covers.
 */

import { currentBranch, ghApi } from './lib/gitState.mjs'
import { REVIEW_WORKFLOW, reviewCoversHead } from './lib/reviewGate.mjs'
import { checkPending, classifyPr } from './lib/prWait.mjs'

const POLL_MS = 20_000
const MAX_UNREADABLE = 3

const args = process.argv.slice(2)
const timeoutArg = args.indexOf('--timeout-min')
// A missing or non-numeric value would make the cap NaN, and the wait would never time out.
const timeoutMin = timeoutArg >= 0 ? Number(args[timeoutArg + 1]) : 9
const timeoutMs = (Number.isFinite(timeoutMin) && timeoutMin > 0 ? timeoutMin : 9) * 60_000
const prArg = args.find((a, i) => /^#?\d+$/.test(a) && args[i - 1] !== '--timeout-min')

function finish(code, outcome, message) {
  console.log(`OUTCOME: ${outcome}`)
  console.log(message)
  process.exit(code)
}

function findPr() {
  if (prArg) return Number(prArg.replace('#', ''))
  const branch = currentBranch()
  const open = branch ? ghApi('repos/{owner}/{repo}/pulls?state=open&per_page=100') : null
  if (!Array.isArray(open)) finish(11, 'unreadable', 'Could not list open PRs (is gh signed in?).')
  const pr = open.find((p) => p?.head?.ref === branch)
  if (!pr) finish(9, 'no-pr', `No open PR has "${branch}" as its head. Open one with gh pr create.`)
  return pr.number
}

/** One REST read of everything `classifyPr` needs, or `null` if any call failed. */
function snapshot(number) {
  const pr = ghApi(`repos/{owner}/{repo}/pulls/${number}`)
  const sha = pr?.head?.sha
  if (!sha) return null
  const runs = ghApi(`repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=100`)
  const status = ghApi(`repos/{owner}/{repo}/commits/${sha}/status`)
  const comments = ghApi(`repos/{owner}/{repo}/issues/${number}/comments?per_page=100`)
  const inline = ghApi(`repos/{owner}/{repo}/pulls/${number}/comments?per_page=100`)
  const files = ghApi(`repos/{owner}/{repo}/pulls/${number}/files?per_page=100`)
  if (!runs || !status || !Array.isArray(comments) || !Array.isArray(inline) || !Array.isArray(files)) return null
  return {
    merged: pr.merged === true,
    open: pr.state === 'open',
    headSha: sha,
    mergeable: typeof pr.mergeable === 'boolean' ? pr.mergeable : null,
    mergeableState: pr.mergeable_state ?? null,
    checks: [
      ...(runs.check_runs ?? []).map((r) => ({
        name: r.name,
        status: String(r.status ?? '').toUpperCase(),
        conclusion: String(r.conclusion ?? '').toUpperCase(),
      })),
      ...(status.statuses ?? []).map((s) => ({ name: s.context, state: String(s.state ?? '').toUpperCase() })),
    ],
    reviewed: reviewCoversHead(comments, sha),
    exempt: files.some((f) => f?.filename === REVIEW_WORKFLOW),
    findings: inline.filter((c) => c?.commit_id === sha && /^claude(\[bot\])?$/i.test(String(c?.user?.login ?? ''))).length,
  }
}

const number = findPr()
const started = Date.now()
let startSha = null
let unreadable = 0
let lastLine = ''

for (;;) {
  const snap = snapshot(number)
  if (!snap) {
    unreadable += 1
    if (unreadable >= MAX_UNREADABLE) finish(11, 'unreadable', `GitHub could not be read ${MAX_UNREADABLE} times in a row.`)
  } else {
    unreadable = 0
    startSha ??= snap.headSha
    const verdict = classifyPr({ ...snap, startSha, elapsedMs: Date.now() - started })
    if (verdict) finish(verdict.code, verdict.outcome, `#${number} @ ${snap.headSha.slice(0, 7)}: ${verdict.message}`)
    const waiting = snap.checks.filter(checkPending).map((c) => c.name)
    const line = `#${number} @ ${snap.headSha.slice(0, 7)}: waiting on ${waiting.length > 0 ? waiting.join(', ') : 'checks to start'}`
    if (line !== lastLine) console.log(line)
    lastLine = line
  }
  if (Date.now() - started > timeoutMs) {
    finish(10, 'timeout', `#${number}: still pending after ${Math.round(timeoutMs / 60_000)} minutes (${lastLine}). Run npm run wait:pr again, or look for a hung job with gh run list.`)
  }
  await new Promise((r) => setTimeout(r, POLL_MS))
}
