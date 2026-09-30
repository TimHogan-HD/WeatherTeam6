#!/usr/bin/env node
/**
 * PreToolUse safety hook for WeatherTeam6.
 *
 * Rewritten from bash + python3 on 2026-08-26. The previous version parsed its
 * stdin with `python3`, which on this machine resolves to the Windows Store stub
 * (AppInstallerPythonRedirector.exe) — it prints an install advert and exits 0.
 * Every field therefore parsed as an empty string, no pattern matched, and every
 * guard below silently passed. Verified: `rm -rf /`, `DROP TABLE users` and
 * `drizzle-kit push` all returned exit 0.
 *
 * Two of the guards were broken a second way: they read `tool_input.path`, but
 * Write and Edit send `tool_input.file_path`. Even with a working Python the
 * .env and migration guards could never have fired.
 *
 * Node is used because this is a Node monorepo — the interpreter is guaranteed
 * present wherever the repo builds.
 *
 * Exit 2 blocks the tool call (stderr goes to Claude). Exit 0 allows it.
 * Every guard here is covered by `npm run check:hooks`.
 */

import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { currentBranch, defaultBranch, isGitRepo } from './lib/gitState.mjs'

/**
 * The branch checked out in `dir` and the repository's default branch, or
 * nulls. A hook must not block a tool call because a git command failed — if
 * the branch cannot be determined, the guard stands down.
 */
function branchesIn(dir) {
  if (!isGitRepo(dir)) return { branch: null, base: null }
  return { branch: currentBranch(dir), base: defaultBranch(dir) }
}

/**
 * A path as the shell wrote it, made resolvable by Node: quotes dropped, `~`
 * expanded, and Git Bash's `/c/Users/...` turned into `c:/Users/...`.
 */
function toNativePath(p) {
  let out = p.trim().replace(/^(['"])(.*)\1$/, '$2')
  if (out === '~' || out.startsWith('~/')) out = homedir() + out.slice(1)
  if (process.platform === 'win32') out = out.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:')
  return out
}

/**
 * Every directory a `git commit` in this command runs in.
 *
 * The guard used to ask git from the hook's own directory, which is the main
 * checkout. On 2026-09-29 a session committing in a worktree on a feature
 * branch was refused because the main checkout was on `main` — and a session in
 * a worktree on `main` would have been let through. So the directory is worked
 * out from the command: start at the session's cwd, follow each `cd`,
 * `Set-Location` or `pushd` before the commit, then apply any `git -C`.
 */
function commitDirectories(cmd, startDir) {
  const dirs = []
  let dir = startDir
  for (const segment of cmd.split(/&&|\|\||[;\n|]/)) {
    const cd =
      /^\s*\(?\s*(?:cd|chdir|pushd|Set-Location|sl|Push-Location)\s+(?:-(?:Literal)?Path\s+)?(\S.*?)\s*$/i.exec(
        segment,
      )
    if (cd) {
      dir = resolve(dir, toNativePath(cd[1]))
      continue
    }
    const git = /\bgit((?:\s+-[cC]\s+(?:"[^"]*"|'[^']*'|\S+)|\s+--?[\w-]+(?:=\S+)?)*)\s+commit\b/.exec(
      segment,
    )
    if (!git) continue
    let target = dir
    for (const c of git[1].matchAll(/\s-C\s+("[^"]*"|'[^']*'|\S+)/g)) {
      target = resolve(target, toNativePath(c[1]))
    }
    dirs.push(target)
  }
  return dirs
}

function readStdin() {
  return new Promise((resolve) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      raw += chunk
    })
    process.stdin.on('end', () => resolve(raw))
    // A hook invoked with no stdin must not hang the tool call.
    process.stdin.on('error', () => resolve(''))
  })
}

function block(message) {
  process.stderr.write(`BLOCKED: ${message}\n`)
  process.exit(2)
}

/** Windows paths arrive with backslashes; normalise before matching. */
function normalisePath(p) {
  return String(p ?? '').replace(/\\/g, '/')
}

/**
 * Strip the parts of a command line that are data rather than executable text:
 * heredoc bodies, and `-m`/`--message` payloads.
 *
 * Added after the first real commit under this hook was blocked by its own
 * commit message, which described the `drizzle-kit push` guard. Prose about a
 * forbidden command is not that command, and in this repo commit messages and
 * docs discuss these patterns constantly.
 *
 * The redirect target still survives stripping — `cat > .env <<EOF` keeps its
 * `> .env` because only the heredoc *body* is removed — so the .env guard is
 * unaffected. Likewise `git commit -m "x" && rm -rf dist` keeps the `rm`,
 * because only the quoted message is removed.
 */
function stripInertText(cmd) {
  let out = String(cmd)
  // Heredoc bodies: <<EOF ... EOF, <<'EOF', <<-EOF.
  out = out.replace(
    /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm,
    ' <<HEREDOC ',
  )
  // An unterminated heredoc (the body is still being written) — drop the rest.
  out = out.replace(/<<-?\s*(['"]?)[A-Za-z_][A-Za-z0-9_]*\1[\s\S]*$/, ' <<HEREDOC ')
  // PowerShell here-strings: @'...'@ and @"..."@, the closer at column 0.
  out = out.replace(/@(['"])\r?\n[\s\S]*?^\1@/gm, ' HERESTRING ')
  out = out.replace(/@(['"])\r?\n[\s\S]*$/, ' HERESTRING ')
  // -m "..." / -m '...' / --message=...
  out = out.replace(/(-m|--message)(\s+|=)(['"])[\s\S]*?\3/g, '$1 MSG')
  return out
}

/**
 * True when the command contains an `rm` that is both recursive and forced.
 *
 * Written as flag inspection rather than a literal `rm -rf` match: `-fr`,
 * `-r -f` and `--recursive --force` are the same command and the old hook
 * caught none of them. Each `rm` in a compound command is checked separately,
 * so `rm -r a && rm -f b` is not treated as `rm -rf`.
 */
function isRecursiveForceRemove(cmd) {
  const invocation = /(?:^|[;&|(]\s*|\s)rm\s+((?:-{1,2}[a-zA-Z-]+\s+)*)/g
  let match
  while ((match = invocation.exec(String(cmd))) !== null) {
    const flags = match[1] ?? ''
    const shortLetters = (flags.match(/(?<!-)-[a-zA-Z]+/g) ?? []).join('')
    const recursive = /r/.test(shortLetters) || /--recursive\b/.test(flags)
    const forced = /f/.test(shortLetters) || /--force\b/.test(flags)
    if (recursive && forced) return true
  }
  return false
}

const raw = await readStdin()

let input
try {
  input = JSON.parse(raw)
} catch {
  // Unparseable input is not a licence to block every tool call in the session.
  process.exit(0)
}

const tool = input?.tool_name ?? ''
const toolInput = input?.tool_input ?? {}
const rawCommand = String(toolInput.command ?? '')
// Match against the executable text only, so a `cd` or `rm -rf` written inside
// a commit message is neither followed nor blocked.
const command = stripInertText(rawCommand)
// `file_path` is what Write/Edit actually send. `path` is kept as a fallback
// only so a future tool using that key is still covered.
const filePath = normalisePath(toolInput.file_path ?? toolInput.path ?? '')

/* ---------------------------------------------------------------- *
 * 1. drizzle-kit push, in any form.
 *    It skips migration files and can drop columns. Always generate + migrate.
 *    Matched narrowly: a bare /drizzle.*push/ also matches a legitimate
 *    `drizzle-kit generate && git push`.
 * ---------------------------------------------------------------- */
if (/\bdrizzle-kit\s+push\b/i.test(command) || /\bdb:push\b/i.test(command)) {
  block(
    'drizzle-kit push skips migration files and risks data loss. ' +
      "Use 'npm run db:generate' then 'npm run db:migrate' instead.",
  )
}

/**
 * True when a PowerShell command removes recursively and forcibly:
 * `Remove-Item -Recurse -Force` or any alias of it, with the parameter
 * prefixes PowerShell accepts (`-r`, `-fo`), or `cmd`'s `rd /s /q`.
 */
function isPowerShellRecursiveForceRemove(cmd) {
  for (const segment of String(cmd).split(/&&|\|\||[;\n|]/)) {
    const words = segment.trim().split(/\s+/)
    const verb = (words[0] ?? '').toLowerCase()
    if (['remove-item', 'ri', 'rm', 'del', 'erase', 'rd', 'rmdir'].includes(verb)) {
      const recursive = words.some((w) => /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/i.test(w))
      const forced = words.some((w) => /^-fo(r(c(e)?)?)?$/i.test(w))
      if (recursive && forced) return true
    }
    if (/(^|\s)(rd|rmdir)\s.*\/s\b.*\/q\b|(^|\s)(rd|rmdir)\s.*\/q\b.*\/s\b/i.test(segment)) return true
  }
  return false
}

/* ---------------------------------------------------------------- *
 * 2. Destructive shell commands.
 *
 *    PowerShell is checked too: until 2026-09-30 these guards watched Bash
 *    only, so `Remove-Item -Recurse -Force` and a `Set-Content .env` passed.
 * ---------------------------------------------------------------- */
if (tool === 'PowerShell') {
  if (isPowerShellRecursiveForceRemove(command) || isRecursiveForceRemove(command)) {
    block('Recursive force delete requires explicit user confirmation before running.')
  }
  if (/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i.test(command)) {
    block('Destructive SQL (DROP) requires explicit user confirmation before running.')
  }
  if (/\btruncate\b[\s\S]*\bcascade\b/i.test(command)) {
    block('TRUNCATE ... CASCADE requires explicit user confirmation before running.')
  }
  if (
    /(>>?|\b(Set-Content|Add-Content|Out-File|sc|ac|tee|Tee-Object)\b[^;|\n]*?)\s*['"]?(\.[\\/])?\.env(?![\w.])/i.test(
      command,
    )
  ) {
    block(
      'Do not create or write .env — use .env.example for key names and set real ' +
        'values in the shell or the Vercel dashboard.',
    )
  }
}

if (tool === 'Bash') {
  if (isRecursiveForceRemove(command)) {
    block('Recursive force delete requires explicit user confirmation before running.')
  }
  if (/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i.test(command)) {
    block('Destructive SQL (DROP) requires explicit user confirmation before running.')
  }
  if (/\btruncate\b[\s\S]*\bcascade\b/i.test(command)) {
    block('TRUNCATE ... CASCADE requires explicit user confirmation before running.')
  }
  // Writing real secrets into .env via a shell redirect. `.env.example` is fine.
  if (/(>>?|\btee\b)\s*['"]?(\.\/)?\.env(?!\.example)\b/.test(command)) {
    block(
      'Do not create or write .env — use .env.example for key names and set real ' +
        'values in the shell or the Vercel dashboard.',
    )
  }
}

/* ---------------------------------------------------------------- *
 * 3. Writes to .env through the file tools.
 * ---------------------------------------------------------------- */
if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
  if (/(^|\/)\.env$/.test(filePath)) {
    block(
      'Do not write to .env — use .env.example for key names and set real values ' +
        'in the shell or the Vercel dashboard.',
    )
  }

  /* -------------------------------------------------------------- *
   * 4. Hand-edited Drizzle migrations.
   * -------------------------------------------------------------- */
  if (/drizzle\/.*\.sql$/.test(filePath) || /drizzle\/meta\//.test(filePath)) {
    block(
      'Never manually edit Drizzle migration files. Change schema.ts and run db:generate.',
    )
  }
}

/* ---------------------------------------------------------------- *
 * 5. Committing on the default branch.
 *
 *    CLAUDE.md has always said work lands via a branch and a PR, and on
 *    2026-08-26 a session-record commit went straight to `main` anyway. A
 *    written rule that is followed most of the time is the failure mode this
 *    repo's tooling exists to remove, so it is a gate now.
 *
 *    `--amend` on an already-pushed default-branch commit is a different and
 *    worse operation, so it is caught too.
 *
 *    The branch is read where the commit runs (`commitDirectories`), and the
 *    PowerShell tool is checked too: on 2026-09-29 a commit went through
 *    PowerShell because this guard only watched Bash.
 * ---------------------------------------------------------------- */
if (tool === 'Bash' || tool === 'PowerShell') {
  const sessionDir = typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd()
  for (const dir of commitDirectories(command, sessionDir)) {
    const { branch, base } = branchesIn(dir)
    if (branch && base && branch === base) {
      block(
        `The commit would land on "${branch}", the default branch (in ${dir}). Work lands ` +
          `through a branch and a PR — create one first:  git checkout -b <type>/<name>\n` +
          'If this is genuinely a direct-to-default commit the user asked for, they can run it themselves.',
      )
    }
  }
}

process.exit(0)
