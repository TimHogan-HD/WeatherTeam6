/**
 * Register `BOT_COMMANDS` with Telegram, so the client's command menu lists
 * exactly what this build answers.
 *
 * Usage, from `apps/api`:
 *   $env:TELEGRAM_BOT_TOKEN = "<bot token>"
 *   npm run bot:set-commands
 *
 * **Deliberately `bot:*` and not `check:*`.** CI runs every root-level `check:*`
 * script, and this one mutates the live bot registration — a check must be safe
 * to run on any branch, and this is not a check at all.
 *
 * It needs only the token: `setMyCommands` is bot-wide, not per chat.
 *
 * console rather than the logger is deliberate — this is an operator CLI and its
 * output is the result.
 */

import { BOT_COMMANDS } from '../lib/telegram/commands.js'

async function run(): Promise<number> {
  const token = process.env['TELEGRAM_BOT_TOKEN']
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not set. Set it in your shell for this one command.')
    return 1
  }

  console.log(`Registering ${String(BOT_COMMANDS.length)} commands:`)
  for (const c of BOT_COMMANDS) console.log(`  /${c.command} — ${c.description}`)

  const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `commands` is the whole list, not a delta: Telegram replaces the previous
    // registration wholesale, so a command dropped from BOT_COMMANDS disappears
    // from the menu on the next run rather than lingering.
    body: JSON.stringify({ commands: BOT_COMMANDS }),
  })

  const body = await res.text().catch(() => '')
  if (!res.ok) {
    // The token is in the URL, never in a log line. Only the response body is
    // printed, and it carries no credential.
    console.error(`setMyCommands failed: HTTP ${String(res.status)} ${body.slice(0, 300)}`)
    return 1
  }

  console.log('Registered. Reopen the chat to see the menu refresh.')
  return 0
}

run()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
