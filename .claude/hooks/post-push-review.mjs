#!/usr/bin/env node
/**
 * PostToolUse hook for WeatherTeam6 — ask for a code review when a PR is opened.
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
  // Since 2026-09-30 the CI reviewer gates the merge (lib/reviewGate.mjs), so
  // this asks for what the gate cannot check: that its findings were read.
  emit(
    'A pull request was just opened. The CI reviewer gates the merge: `gh pr merge` is ' +
      'blocked until its "## Claude review" comment names the head commit. When it posts, ' +
      'read every inline finding and fix it or reply on the PR why it is not a defect — ' +
      'the defects this project ships pass typecheck, lint and the suite. For a large or ' +
      'risky diff, also run /code-review high locally.',
  )
}

process.exit(0)
