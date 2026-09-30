#!/usr/bin/env node
/**
 * Stop hook — refuse to end the turn while code work is unfinished.
 *
 * Written 2026-08-26 after the user asked, fairly, whether everything had been
 * reviewed, PR'd and merged, and said: *"If you keep forgetting those steps then
 * I need those rules integrated somehow. I only want to interact when it is
 * ABSOLUTELY needed."*
 *
 * The audit that produced this repo's current tooling concluded that written
 * rules degrade and hooks do not. CLAUDE.md already said to branch off main and
 * commit per phase, and a session-record commit still went straight to `main`
 * with no PR. So this is the rule as a gate rather than as prose.
 *
 * Exit 2 blocks the turn from ending and hands the reason back, so the work gets
 * finished instead of the user being asked to notice. Claude Code overrides the
 * hook after 8 consecutive blocks, which is the deadlock safety valve.
 *
 * Escape hatch: `touch .claude/.wip` suppresses every check for 12 hours. Use
 * it when the user has explicitly asked to pause mid-change, and delete it when
 * work resumes. It is gitignored.
 *
 * Deliberately NOT checked here: whether tests pass. That belongs to CI and to
 * the review checklist. This hook is about work being *delivered*, not correct.
 *
 * Covered by `npm run check:hooks`.
 */

import { existsSync, statSync } from 'node:fs'
import {
  checksArePassing,
  currentBranch,
  defaultBranch,
  git,
  hasRemote,
  isGitRepo,
  openPullRequests,
  unpushedCommits,
  workingTreeChanges,
} from './lib/gitState.mjs'
import { reviewState } from './lib/reviewGate.mjs'
import { activePeers, porcelainPath } from './lib/sessionClaims.mjs'

function readStdin() {
  return new Promise((resolve) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => {
      raw += c
    })
    process.stdin.on('end', () => resolve(raw))
    process.stdin.on('error', () => resolve(''))
  })
}

function blockTurn(lines) {
  process.stderr.write(`${lines.join('\n')}\n`)
  process.exit(2)
}

// Always consume stdin, so the caller is not left writing to a closed pipe.
const raw = await readStdin()

// Read the checkout the session is working in, not the one the hook was started
// from — a session in a worktree otherwise ends with its commits unpushed and
// this hook looking at the main checkout.
let sessionId = null
try {
  const payload = JSON.parse(raw)
  sessionId = payload?.session_id ?? null
  const cwd = payload?.cwd
  if (typeof cwd === 'string' && cwd) process.chdir(cwd)
} catch {
  // No payload or no such directory: stay where the hook started.
}

// ---- preconditions: never block outside a normal repo state ----------------

if (!isGitRepo() || !hasRemote()) process.exit(0)

// A pause lasts WIP_MAX_AGE_HOURS. One set on 2026-09-29 was still switching
// every check below off a day and dozens of merges later; an expired flag is
// ignored, and SessionStart reports it either way.
const WIP_MAX_AGE_HOURS = 12
if (existsSync('.claude/.wip')) {
  const ageHours = (Date.now() - statSync('.claude/.wip').mtimeMs) / 3_600_000
  if (ageHours < WIP_MAX_AGE_HOURS) process.exit(0)
}

const branch = currentBranch()
const base = defaultBranch()

// Detached HEAD or an undiscoverable default branch: not a state this hook
// understands, and guessing would block work it cannot explain.
if (!branch || !base) process.exit(0)

// ---- 1. uncommitted work ---------------------------------------------------

// A file that an active other session claims is that session's to finish. Every
// other change, including one nobody claims, is this session's.
const peers = activePeers(sessionId)
const peerOwns = (line) => peers.some((p) => p.files.has(porcelainPath(line)))
const allChanges = workingTreeChanges()
const changes = allChanges.filter((line) => !peerOwns(line))
if (changes.length === 0 && allChanges.length > 0) {
  // Another session is mid-change in this checkout, and the branch may be its
  // too. The delivery checks below would judge its work, so stop here.
  process.exit(0)
}
if (changes.length > 0) {
  const shown = changes.slice(0, 10).join('\n  ')
  const more = changes.length > 10 ? `\n  ...and ${changes.length - 10} more` : ''
  blockTurn([
    'UNFINISHED: the working tree has uncommitted changes.',
    '',
    `  ${shown}${more}`,
    '',
    'Do not hand this back to the user. Finish it:',
    `  - if this is real work, commit it on a branch (you are on "${branch}")`,
    '  - if it is scratch, delete it',
    '  - if the user explicitly asked you to pause here, create .claude/.wip',
  ])
}

// ---- 2. committing on the default branch -----------------------------------

if (branch === base) {
  const ahead = unpushedCommits()
  if (ahead.length > 0) {
    blockTurn([
      `UNFINISHED: ${ahead.length} commit(s) sit on "${base}" and have not been pushed.`,
      '',
      `  ${ahead.join('\n  ')}`,
      '',
      'Work is not supposed to land on the default branch directly. Move it:',
      `  git branch <name> && git reset --hard origin/${base} && git checkout <name>`,
      'then push and open a PR.',
    ])
  }
  // On base, clean, synced — check for PRs left open below.
} else {
  // ---- 3. a feature branch with commits that are not pushed ----------------

  const ahead = unpushedCommits()
  if (ahead.length > 0) {
    blockTurn([
      `UNFINISHED: "${branch}" has ${ahead.length} unpushed commit(s).`,
      '',
      `  ${ahead.join('\n  ')}`,
      '',
      `Push it and open a PR:  git push -u origin ${branch}`,
    ])
  }

  // ---- 4. a pushed feature branch with no PR ------------------------------

  const prs = openPullRequests()
  if (prs !== null) {
    const mine = prs.find((p) => p.headRefName === branch)
    const branchHasCommits = (git(['log', `origin/${base}..HEAD`, '--oneline']) ?? '').trim()
    if (!mine && branchHasCommits) {
      blockTurn([
        `UNFINISHED: "${branch}" is pushed and ahead of ${base}, but has no open PR.`,
        '',
        'Open one:  gh pr create',
        'If it was already merged, switch back:  git checkout ' + base,
      ])
    }
  }
}

// ---- 5. an open PR that is green and mergeable -----------------------------

const prs = openPullRequests()
if (prs === null) process.exit(0) // gh unavailable; do not guess.

const green = prs.filter((p) => p.mergeable === 'MERGEABLE' && checksArePassing(p))
// The merge gate (lib/reviewGate.mjs) refuses a PR the CI reviewer has not
// covered at its head, so asking for that merge would only loop. Green means the
// reviewer job has finished; if it left no summary, that is the thing to fix.
const states = green.map((p) => ({ p, s: reviewState(p.number) }))
const ready = states.filter(({ s }) => s === null || s.reviewed || s.exempt).map(({ p }) => p)
const unreviewed = states.filter(({ s }) => s !== null && !s.reviewed && !s.exempt)
if (ready.length > 0) {
  blockTurn([
    `UNFINISHED: ${ready.length} PR(s) are green, reviewed, mergeable, and still open.`,
    '',
    ...ready.map((p) => `  #${p.number}  ${p.title}`),
    '',
    'The user has a standing preference that you merge rather than hand PRs back.',
    'Read the reviewer\'s inline findings first and deal with each one. Then merge:',
    `  gh pr merge <n> --squash --delete-branch`,
    'Then switch to the default branch and pull.',
  ])
}
if (unreviewed.length > 0) {
  blockTurn([
    `UNFINISHED: ${unreviewed.length} PR(s) are green but the CI reviewer posted no summary ` +
      'for the head commit, so they cannot merge.',
    '',
    ...unreviewed.map(({ p, s }) => `  #${p.number}  ${p.title}  (head ${String(s.headSha).slice(0, 7)})`),
    '',
    'Rerun the reviewer:  gh run list --workflow "Claude Review" --limit 3,  then  gh run rerun <id>',
    'If a rerun also posts nothing, tell the user the reviewer is broken rather than retrying.',
  ])
}

process.exit(0)
