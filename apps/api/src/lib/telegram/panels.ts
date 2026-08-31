import { escapeTelegramHtml, formatPrecipIn, formatTempF, formatWindMph } from '@weatherteam6/types'
import type { ForecastSnapshot } from '@weatherteam6/types'
import { encodeAction } from './callbackData.js'
import { formatConditionsReply, type ConditionsReplyInput } from './conditionsMessage.js'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from './sendMessage.js'
import type { PanelMode } from './panelState.js'

/**
 * The panel messages: `{ text, keyboard }`, one per view.
 *
 * **Pure**, and in its own module with no database import, for the same reason
 * `conditionsMessage.ts` is: the copy and the keyboard shape can be tested
 * directly, and importing the data layer would take any test importing this file
 * down with it. `panelViews.ts` is the half that reads the database.
 *
 * Two escaping rules, and they are opposites:
 *
 * - **Message text is HTML** (`parse_mode: 'HTML'`), so every interpolated value
 *   is escaped. A location named "Bear & Cub" is otherwise a 400 the webhook
 *   swallows, and a literal string needs it as much as an interpolated one.
 * - **Button labels are plain text.** Telegram does not parse them, so escaping
 *   one would put a literal `&amp;` on the button.
 */

export type Panel = {
  readonly text: string
  readonly keyboard: InlineKeyboardMarkup | null
}

/** Verbs the webhook dispatches on. Short because they are spent on the 64-byte budget. */
export const VERB_OPEN = 'open'
export const VERB_VIEW = 'view'
export const VERB_MODE = 'mode'
export const VERB_REFRESH = 'refresh'

/**
 * What a button whose state row is gone says. A redeploy does not clear these
 * rows, but the 7-day prune does, and an id from another chat reads the same
 * way — so the honest answer is that the panel expired, never a guess at what
 * it used to be showing.
 */
export const EXPIRED_PANEL_TEXT = escapeTelegramHtml(
  'That panel has expired. Send /locations to open a new one.',
)

export type LocationChoice = {
  readonly id: string
  readonly name: string
}

/**
 * Locations are dropped from the *keyboard* if their id will not encode, never
 * from the *list*. A missing button is a control the user can work around; a
 * missing location is the bot claiming they do not have it.
 */
function locationButton(stateId: string, choice: LocationChoice): InlineKeyboardButton | null {
  const data = encodeAction(VERB_OPEN, stateId, 'loc', choice.id)
  if (data === null) return null
  return { text: choice.name, callback_data: data }
}

function navRow(stateId: string, exclude: 'list' | 'alerts' | null): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = []
  const list = exclude === 'list' ? null : encodeAction(VERB_VIEW, stateId, 'v', 'list')
  const alerts = exclude === 'alerts' ? null : encodeAction(VERB_VIEW, stateId, 'v', 'alerts')
  const refresh = encodeAction(VERB_REFRESH, stateId)
  if (list !== null) row.push({ text: '📋 Locations', callback_data: list })
  if (alerts !== null) row.push({ text: '⚠️ Alerts', callback_data: alerts })
  if (refresh !== null) row.push({ text: '🔄 Refresh', callback_data: refresh })
  return row
}

/** `null` rather than `{ inline_keyboard: [] }` when nothing could be built — the message still sends. */
function keyboardOf(rows: InlineKeyboardButton[][]): InlineKeyboardMarkup | null {
  const populated = rows.filter((r) => r.length > 0)
  return populated.length === 0 ? null : { inline_keyboard: populated }
}

export function buildListPanel(stateId: string, choices: readonly LocationChoice[]): Panel {
  const lines = ['<b>Your locations</b>', '']
  if (choices.length === 0) {
    lines.push(
      escapeTelegramHtml('You have no saved locations yet. Open the app from the menu button to add one.'),
    )
  } else {
    for (const c of choices) lines.push(`• ${escapeTelegramHtml(c.name)}`)
    lines.push('', escapeTelegramHtml('Tap one for its conditions.'))
  }

  const buttons = choices
    .map((c) => locationButton(stateId, c))
    .filter((b): b is InlineKeyboardButton => b !== null)

  return {
    text: lines.join('\n'),
    // One per row: a location name is as long as the user made it, and two of
    // them side by side truncate to initials on a phone.
    keyboard: keyboardOf([...buttons.map((b) => [b]), navRow(stateId, 'list')]),
  }
}

/** Fixed table, deliberately not `toLocaleDateString` — the label must not follow the server's locale. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * `Thu` for a `YYYY-MM-DD` local calendar day, or `null` when it is not one.
 *
 * Read as UTC on purpose. `forecast_date` is already the *location's* local day
 * (Open-Meteo `timezone=auto`, issue #33), so re-interpreting it in the server's
 * zone would shift it back off by a day — the exact bug #33 fixed.
 */
export function weekdayLabel(forecastDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(forecastDate)) return null
  const at = new Date(`${forecastDate}T00:00:00Z`)
  const day = at.getUTCDay()
  return Number.isNaN(day) ? null : (WEEKDAYS[day] ?? null)
}

/**
 * The multi-day block Advanced mode adds. Monospace so the columns line up.
 *
 * Every value goes through the nullable formatters, which render an em dash —
 * `cToF(null)` is 32°F and `kmhToMph(null)` is 0 mph, both of which read as
 * measurements.
 *
 * The today row is labelled from the server's `is_today` flag and nothing else.
 * A feed with no flagged row gets no "Today" label rather than one derived from
 * the server's clock: a missing flag is unknown, not false.
 */
export function formatOutlook(snapshots: readonly ForecastSnapshot[]): string | null {
  if (snapshots.length === 0) return null

  const rows = snapshots.slice(0, 7).map((s) => {
    const label = s.is_today === true ? 'Today' : (weekdayLabel(s.forecast_date) ?? '?')
    return [
      label.padEnd(5),
      formatTempF(s.temp_c_max).padStart(6),
      formatWindMph(s.wind_kmh_max).padStart(7),
      formatPrecipIn(s.precip_mm_p50).padStart(8),
    ].join(' ')
  })

  const header = ['day'.padEnd(5), 'high'.padStart(6), 'wind'.padStart(7), 'rain'.padStart(8)].join(' ')
  // Escaped inside <pre> too. The formatters emit no markup today, but "escape
  // only what looks dangerous" is how `/start` shipped dead for months.
  return `<pre>${escapeTelegramHtml([header, ...rows].join('\n'))}</pre>`
}

export type ConditionsPanelInput = {
  readonly stateId: string
  readonly mode: PanelMode
  readonly conditions: ConditionsReplyInput
}

export function buildConditionsPanel(input: ConditionsPanelInput): Panel {
  const { stateId, mode, conditions } = input
  const parts = [formatConditionsReply(conditions)]

  if (mode === 'advanced') {
    const outlook = formatOutlook(conditions.snapshots)
    // Omitted rather than rendered as an empty table: a header with no rows
    // under a heading reads as "no rain, no wind, no heat" for the week.
    if (outlook !== null) parts.push('', '<b>Next days</b>', outlook)
  }

  const toggle =
    mode === 'advanced'
      ? encodeAction(VERB_MODE, stateId, 'm', 'simple')
      : encodeAction(VERB_MODE, stateId, 'm', 'advanced')

  const toggleRow: InlineKeyboardButton[] =
    toggle === null
      ? []
      : [{ text: mode === 'advanced' ? '◀ Simple' : '⚙ Advanced', callback_data: toggle }]

  return {
    text: parts.join('\n'),
    keyboard: keyboardOf([toggleRow, navRow(stateId, null)]),
  }
}

export type PanelAlert = {
  readonly locationName: string
  readonly event: string
  readonly severity: string
  readonly headline: string | null
}

/**
 * Active alerts across every saved location.
 *
 * The empty case says **what is stored**, not "no alerts". These rows are
 * written by `/api/cron/check-alerts`, nothing records when that last ran, and
 * an empty table equally means NWS was never asked — the same false attribution
 * that once let a failed fetch render as all-clear.
 */
export function buildAlertsPanel(stateId: string, alerts: readonly PanelAlert[]): Panel {
  const lines = ['<b>Active alerts</b>', '']

  if (alerts.length === 0) {
    lines.push(
      escapeTelegramHtml(
        'Nothing stored for your locations. Alerts arrive from a background NWS check, so an empty list means none is on file — not that NWS was asked just now.',
      ),
    )
  } else {
    for (const a of alerts) {
      const detail = a.headline ?? a.event
      lines.push(
        `⚠️ <b>${escapeTelegramHtml(a.locationName)}</b> — ${escapeTelegramHtml(a.event)} (${escapeTelegramHtml(a.severity)})`,
        escapeTelegramHtml(detail),
        '',
      )
    }
    lines.push(escapeTelegramHtml('Source: NWS'))
  }

  return { text: lines.join('\n'), keyboard: keyboardOf([navRow(stateId, 'alerts')]) }
}

export function buildHelpPanel(stateId: string, helpText: string): Panel {
  return { text: helpText, keyboard: keyboardOf([navRow(stateId, null)]) }
}

/**
 * A panel that says one thing and keeps its navigation — for a state that is
 * valid but whose subject is gone, e.g. a location deleted while its panel was
 * still on screen. It says that, rather than silently falling back to the list
 * as though the tap had meant something else.
 */
export function buildNoticePanel(stateId: string, notice: string): Panel {
  return {
    text: escapeTelegramHtml(notice),
    keyboard: keyboardOf([navRow(stateId, null)]),
  }
}
