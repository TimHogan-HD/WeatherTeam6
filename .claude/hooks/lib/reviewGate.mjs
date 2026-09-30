/**
 * The merge gate: a PR merges only after the CI reviewer has posted its summary
 * for the PR's current head commit.
 *
 * Written 2026-09-30. PRs were merging about two minutes after they opened,
 * the local `/code-review` the post-PR hook asked for ran in 6 of 59 sessions,
 * and the CI reviewer had passed 60 PRs in a row without reading them. A review
 * that is asked for is skipped; one that gates the merge is not.
 *
 * The reviewer's summary names the commit it read (`claude-review.yml` puts the
 * head SHA in its prompt), so a review of an earlier push never covers a later
 * one.
 */

import { gh } from './gitState.mjs'

export const REVIEW_HEADING = '## Claude review'
export const REVIEW_WORKFLOW = '.github/workflows/claude-review.yml'

/**
 * The PR a merge command targets: `{ pr: number | null }` for a merge of a
 * numbered PR or of the current branch's PR, or `null` when the command merges
 * nothing. Covers `gh`, `gh.exe` and a quoted full path to either.
 */
export function mergeRequest(command) {
  const m = /\bgh(?:\.exe)?['"]?\s+pr\s+merge\b([^;&|\n]*)/i.exec(String(command))
  if (!m) return null
  const number = /(?:^|\s)#?(\d+)(?=\s|$)/.exec(m[1])
  return { pr: number ? Number(number[1]) : null }
}

/** True when a comment by the reviewer bot carries the heading and this head SHA. */
export function reviewCoversHead(comments, headSha) {
  if (!headSha || !Array.isArray(comments)) return false
  return comments.some(
    (c) =>
      /^claude(\[bot\])?$/i.test(String(c?.user?.login ?? c?.author?.login ?? '')) &&
      String(c?.body ?? '').includes(REVIEW_HEADING) &&
      String(c?.body ?? '').includes(headSha),
  )
}

/**
 * `{ number, headSha, reviewed, exempt }` for a PR (the current branch's when
 * `pr` is null), or `null` when GitHub cannot be read — callers stand down
 * rather than guess, as every other gh-backed guard here does.
 *
 * `exempt`: the reviewer action refuses to run on a PR that changes its own
 * workflow file, so such a PR can never be reviewed and is not held for one.
 */
export function reviewState(pr) {
  const raw = gh(['pr', 'view', ...(pr ? [String(pr)] : []), '--json', 'number,headRefOid,files'])
  if (!raw) return null
  let view
  try {
    view = JSON.parse(raw)
  } catch {
    return null
  }
  const exempt = (view.files ?? []).some((f) => f?.path === REVIEW_WORKFLOW)
  const comments = gh(['api', `repos/{owner}/{repo}/issues/${view.number}/comments?per_page=100`])
  if (comments === null) return null
  let list
  try {
    list = JSON.parse(comments)
  } catch {
    return null
  }
  return {
    number: view.number,
    headSha: view.headRefOid,
    reviewed: reviewCoversHead(list, view.headRefOid),
    exempt,
  }
}
