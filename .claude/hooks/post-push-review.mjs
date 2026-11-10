#!/usr/bin/env node
/**
 * PostToolUse hook for WeatherTeam6 — ask for a code review when a PR is opened.
 *
 * Rewritten from bash + python3 on 2026-08-26 for the reason recorded in
 * pre-tool-safety.mjs: `python3` here is the Windows Store stub, so the command
 * always parsed as an empty string and this hook never fired.
 *
 * It also replaced a second hook on `mcp__github__create_pull_request`, which
 * never fired locally: the project configures no GitHub MCP server, and a local
 * session opens PRs with `gh pr create`. A cloud session does open PRs through
 * the GitHub MCP tool, so this hook does not fire there; the `review` check and
 * the Stop hook still cover that PR.
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
      // Inside hookSpecificOutput. Until 2026-10-07 this sat beside it, where
      // Claude Code does not read it, so the reminder never reached the model.
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context },
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

// One review per PR, when it is opened. A later push to the same branch does not
// ask again: the `review` CI job re-reviews every push to an open PR.
if (/\bgh\s+pr\s+create\b/.test(command)) {
  // The required `review` check fails on blocking findings (claude-review.yml),
  // so this asks for what the check cannot: that the advisory ones were read.
  // It no longer suggests a local /code-review as well (2026-11-10): the CI
  // reviewer already runs Opus on every PR, a local pass shares the session's
  // blind spot (claude-review.yml header), and it doubled the cost of a PR.
  emit(
    'A pull request was just opened. The required `review` check fails on the CI ' +
      'reviewer\'s blocking findings; its advisory ones do not block. When it posts, read ' +
      'every inline finding and fix it or reply on the PR why it is not a defect — the ' +
      'defects this project ships pass typecheck, lint and the suite.',
  )
}

process.exit(0)
