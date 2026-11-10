#!/usr/bin/env node
/**
 * Writes the CI reviewer's scope (mode, model, max_turns, since, unchanged) to
 * $GITHUB_OUTPUT. The decision is `pickScope` in .claude/hooks/lib/reviewScope.mjs,
 * covered by `npm run check:hooks`; this only gathers its inputs.
 *
 * Any failure to read GitHub or git falls back to a full review: reviewing too
 * much costs tokens, reviewing too little ships a defect.
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { FULL, normalizeDiff, pickScope } from '../../.claude/hooks/lib/reviewScope.mjs'

const { PR_NUMBER, HEAD_SHA, EVENT_ACTION, GITHUB_REPOSITORY, GITHUB_OUTPUT } = process.env

const run = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

let scope = { ...FULL, since: null }
try {
  const comments = JSON.parse(
    run('gh', ['api', '--paginate', '--slurp', `repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments?per_page=100`]),
  ).flat()
  // Who opened the PR and which files it changes, for the Dependabot / no-code
  // light review. Unreadable means unknown, and unknown keeps the Opus review.
  let author = null
  let changedFiles = null
  let base = null
  try {
    const pr = JSON.parse(run('gh', ['api', `repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}`]))
    author = pr?.user?.login ?? null
    base = pr?.base?.ref ?? null
    if (base) {
      changedFiles = run('git', ['diff', '--name-only', `origin/${base}...${HEAD_SHA}`])
        .split('\n')
        .filter(Boolean)
    }
  } catch {
    // Keep the defaults.
  }
  scope = pickScope({
    author,
    changedFiles,
    action: EVENT_ACTION,
    headSha: HEAD_SHA,
    comments,
    // The PR's own diff against its base, at the reviewed commit and at the
    // head, with only hunk headers and blob ids normalised away. Equal means
    // the push brought in only main's changes, none inside the PR's hunks.
    prUnchanged: (since) => {
      if (!base) return false
      const own = (sha) => normalizeDiff(run('git', ['diff', `origin/${base}...${sha}`]))
      const before = own(since)
      return before.trim() !== '' && before === own(HEAD_SHA)
    },
    isAncestor: (sha) => {
      try {
        run('git', ['merge-base', '--is-ancestor', sha, HEAD_SHA])
        return true
      } catch {
        return false
      }
    },
  })
} catch {
  // Fall through to a full review.
}

const lines = [
  `mode=${scope.mode}`,
  `model=${scope.model}`,
  `max_turns=${scope.maxTurns}`,
  `since=${scope.since ?? ''}`,
  `unchanged=${scope.unchanged === true}`,
]
if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, lines.join('\n') + '\n')
console.log(lines.join('\n'))
