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

import { currentBranch, ghApi } from './gitState.mjs'

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
 * `pr` is null), or `null` when GitHub cannot be read. The merge guard refuses
 * on `null` (fail closed, since 2026-10-07): a gate that opens whenever `gh`
 * fails was open in every cloud session, where GraphQL is refused.
 *
 * REST only, for that reason. `exempt`: the reviewer action refuses to run on a
 * PR that changes its own workflow file, so such a PR can never be reviewed and
 * is not held for one.
 */
export function reviewState(pr) {
  let number = pr
  if (!number) {
    const branch = currentBranch()
    const open = branch ? ghApi('repos/{owner}/{repo}/pulls?state=open&per_page=100') : null
    if (!Array.isArray(open)) return null
    number = open.find((p) => p?.head?.ref === branch)?.number
    if (!number) return null
  }
  const view = ghApi(`repos/{owner}/{repo}/pulls/${number}`)
  const files = ghApi(`repos/{owner}/{repo}/pulls/${number}/files?per_page=100`)
  const comments = ghApi(`repos/{owner}/{repo}/issues/${number}/comments?per_page=100`)
  if (!view?.head?.sha || !Array.isArray(files) || !Array.isArray(comments)) return null
  return {
    number,
    headSha: view.head.sha,
    reviewed: reviewCoversHead(comments, view.head.sha),
    exempt: files.some((f) => f?.filename === REVIEW_WORKFLOW),
  }
}
