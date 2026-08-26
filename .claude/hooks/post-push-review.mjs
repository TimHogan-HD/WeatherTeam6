#!/usr/bin/env node
/**
 * PostToolUse hook for WeatherTeam6 — nudge a code review after code leaves the
 * machine.
 *
 * Rewritten from bash + python3 on 2026-08-26 for the reason recorded in
 * pre-tool-safety.mjs: `python3` here is the Windows Store stub, so the command
 * always parsed as an empty string and this hook never fired.
 *
 * It also replaces a second dead hook. `.claude/settings.json` matched
 * `mcp__github__create_pull_request`, but no GitHub MCP server is configured in
 * this project — PRs are opened with the `gh` CLI through Bash, so that matcher
 * could never fire either. Both paths are handled here.
 *
 * Output is JSON `additionalContext` rather than bare stdout: PostToolUse stdout
 * is informational, whereas additionalContext is delivered to the model as
 * context it must act on.
 *
 * Always exits 0 — PostToolUse cannot block, and the tool has already run.
 */

function readStdin() {
  return new Promise((resolve) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      raw += chunk
    })
    process.stdin.on('end', () => resolve(raw))
    process.stdin.on('error', () => resolve(''))
  })
}

function emit(context) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse' },
      additionalContext: context,
    })}\n`,
  )
  process.exit(0)
}

const raw = await readStdin()

let input
try {
  input = JSON.parse(raw)
} catch {
  process.exit(0)
}

const command = String(input?.tool_input?.command ?? '')

// `gh pr create` is checked first: it is usually preceded by a push in the same
// compound command, and the PR case is the one with a review target.
if (/\bgh\s+pr\s+create\b/.test(command)) {
  emit(
    'A pull request was just opened with the gh CLI. Before responding to the user, ' +
      'run the code-review skill at high effort (/code-review high) on this branch. ' +
      'Read .claude/rules/defect-patterns.md first — the defects this project ships ' +
      'pass typecheck, lint and the suite, so the diff review is the control that works. ' +
      'Do not skip this step.',
  )
}

if (/\bgit\s+push\b/.test(command)) {
  emit(
    'Code was just pushed to the remote. Before ending this stretch of work, run the ' +
      'code-review skill on the branch diff (/code-review). If a PR exists, --comment ' +
      'posts the findings as inline review comments. Read the diff yourself as prose ' +
      'as well — that is Gate 0 of .claude/rules/review-checklist.md.',
  )
}

process.exit(0)
