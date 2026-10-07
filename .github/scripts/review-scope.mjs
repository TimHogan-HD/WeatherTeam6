#!/usr/bin/env node
/**
 * Writes the CI reviewer's scope (mode, model, max_turns, since) to
 * $GITHUB_OUTPUT. The decision is `pickScope` in .claude/hooks/lib/reviewScope.mjs,
 * covered by `npm run check:hooks`; this only gathers its inputs.
 *
 * Any failure to read GitHub or git falls back to a full review: reviewing too
 * much costs tokens, reviewing too little ships a defect.
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { FULL, pickScope } from '../../.claude/hooks/lib/reviewScope.mjs'

const { PR_NUMBER, HEAD_SHA, EVENT_ACTION, GITHUB_REPOSITORY, GITHUB_OUTPUT } = process.env

const run = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

let scope = { ...FULL, since: null }
try {
  const comments = JSON.parse(
    run('gh', ['api', '--paginate', '--slurp', `repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments?per_page=100`]),
  ).flat()
  scope = pickScope({
    action: EVENT_ACTION,
    headSha: HEAD_SHA,
    comments,
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
]
if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, lines.join('\n') + '\n')
console.log(lines.join('\n'))
