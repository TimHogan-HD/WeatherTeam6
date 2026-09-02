import { escapeTelegramHtml } from '@weatherteam6/types'

/**
 * Command parsing and the registered command list.
 *
 * **Pure** — no database, no env — so both are directly testable and the webhook
 * route stays a dispatcher.
 *
 * What this replaces: `text.startsWith('/conditions')`. That matches
 * `/conditionsfoo`, it matches `/conditions` addressed to a different bot only
 * by accident, and it would permanently shadow any future `/conditionshistory` —
 * the new command would be swallowed by the old one with no error anywhere.
 */

/**
 * A Telegram command line. The name is bounded at Telegram's own 32-character
 * limit, the optional `@botname` suffix is what clients append in groups, and
 * everything after the first run of whitespace is the argument.
 *
 * Anchored at both ends: an unanchored pattern would match a command mentioned
 * halfway through a sentence.
 */
const COMMAND_RE = /^\/([A-Za-z0-9_]{1,32})(?:@([A-Za-z0-9_]{1,32}))?(?:\s+([\s\S]*))?$/

export type ParsedCommand = {
  /** Lowercased — Telegram treats `/Start` and `/start` as the same command. */
  readonly name: string
  /** The `@botname` suffix as sent, or `null`. Not lowercased: it is an identity, not a keyword. */
  readonly botName: string | null
  /** Everything after the command, trimmed. `''` when there was none. */
  readonly args: string
}

/** `null` for anything that is not a command line — ordinary chat text, or an empty message. */
export function parseCommand(text: string): ParsedCommand | null {
  const match = COMMAND_RE.exec(text.trim())
  if (match === null) return null

  const [, name, botName, args] = match
  if (name === undefined) return null

  return {
    name: name.toLowerCase(),
    botName: botName ?? null,
    args: args?.trim() ?? '',
  }
}

export type BotCommand = {
  readonly command: string
  readonly description: string
}

/**
 * The commands registered with `setMyCommands` and rendered by `/help`.
 *
 * **Only commands this build actually answers.** `/insight`, `/afd`, `/weather`
 * and `/remove` are Phases 4 and 5 and are absent here on purpose. Registering a
 * command the bot does not handle puts it in the client's command menu, where
 * tapping it produces silence — the same class of false attribution as naming a
 * source that never answered.
 *
 * A command added here does not reach the client's menu until someone runs
 * `npm run bot:set-commands` with the bot token: the list is registered with
 * Telegram, not derived from this file at runtime.
 *
 * Descriptions carry no angle brackets. `/start` was dead from the day it was
 * written because its reply contained a literal `<location name>`, which
 * `parse_mode: 'HTML'` rejects as an unsupported start tag; `formatHelp` escapes
 * anyway, but not needing the escape is better than relying on it.
 */
export const BOT_COMMANDS: readonly BotCommand[] = [
  { command: 'start', description: 'Open the bot panel' },
  { command: 'locations', description: 'Pick one of your saved locations' },
  { command: 'conditions', description: 'How a place is looking right now' },
  { command: 'forecast', description: 'Hour by hour for one day' },
  { command: 'rain', description: 'When rain arrives, and how much' },
  { command: 'alerts', description: 'Active weather alerts across your locations' },
  { command: 'help', description: 'What this bot can do' },
]

/**
 * The `/help` body. Escaped because it goes out with `parse_mode: 'HTML'`, and a
 * literal string needs that as much as an interpolated one does.
 */
export function formatHelp(): string {
  const lines = ['<b>WeatherTeam6</b>', '']
  for (const c of BOT_COMMANDS) {
    lines.push(`/${escapeTelegramHtml(c.command)} — ${escapeTelegramHtml(c.description)}`)
  }
  lines.push('', escapeTelegramHtml('Tip: /conditions red rock — a partial name is enough.'))
  return lines.join('\n')
}
