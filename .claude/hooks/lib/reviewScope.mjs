/**
 * How much of a PR the CI reviewer reads on this run.
 *
 * The merge gate (reviewGate.mjs) wants a review naming every head commit, so
 * before 2026-10-07 each push re-reviewed the whole PR from scratch. Now the
 * first review is full, and a later push is reviewed from the last commit the
 * reviewer already covered: the full diff once, then only what changed.
 *
 * A full review is the fallback whenever the earlier one cannot be trusted to
 * cover the base of the new diff: no earlier summary, a force-push that dropped
 * the reviewed commit, or a PR marked ready or reopened (a deliberate re-look).
 */

import { REVIEW_HEADING } from './reviewGate.mjs'

export const FULL = { mode: 'full', model: 'claude-opus-5-5', maxTurns: 40 }
export const INCREMENTAL = { mode: 'incremental', model: 'claude-sonnet-5-5', maxTurns: 20 }

/** The commit the newest reviewer-bot summary names, or null. */
export function lastReviewedSha(comments) {
  if (!Array.isArray(comments)) return null
  for (const c of [...comments].reverse()) {
    const login = String(c?.user?.login ?? c?.author?.login ?? '')
    const body = String(c?.body ?? '')
    if (!/^claude(\[bot\])?$/i.test(login) || !body.includes(REVIEW_HEADING)) continue
    const m = /Commit:\s*([0-9a-f]{40})\b/.exec(body)
    if (m) return m[1]
  }
  return null
}

/**
 * `{ mode, model, maxTurns, since }`. `isAncestor(sha)` says whether `sha` is
 * still in the head's history; `since` is null for a full review.
 */
export function pickScope({ action, headSha, comments, isAncestor }) {
  const since = lastReviewedSha(comments)
  if (action !== 'synchronize' || !since || since === headSha || !isAncestor(since)) {
    return { ...FULL, since: null }
  }
  return { ...INCREMENTAL, since }
}
