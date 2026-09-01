import { escapeTelegramHtml, formatPrecipIn, formatTempF, formatWindMph } from '@weatherteam6/types'
import type { ForecastSnapshot } from '@weatherteam6/types'
import { encodeAction } from './callbackData.js'
import { formatConditionsReply, type ConditionsReplyInput } from './conditionsMessage.js'
import {
  COLUMN_SETS,
  COLUMN_SET_KEYS,
  dayHasData,
  INTERVAL_HOURS,
  modelLabel,
  probabilityNote,
  renderTable,
  stepNote,
  type ColumnSet,
  type ForecastRow,
  type IntervalHours,
  type TableUnits,
} from './forecastTable.js'
import {
  describePrecip,
  formatLastRain,
  rainTableNote,
  renderRainTable,
  type LastRain,
  type RainDay,
} from './rainMessage.js'
import { sparkline } from './sparkline.js'
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
 * One verb for every "change one setting and redraw" button — the day, the
 * model, the step, the column set and the units. They differ only in which field
 * they name, and a verb each would spend the 64-byte budget on saying the same
 * thing five ways.
 */
export const VERB_SET = 'set'

export const FIELD_DAY = 'd'
export const FIELD_MODEL = 'mdl'
export const FIELD_INTERVAL = 'iv'
export const FIELD_COLUMNS = 'cs'
export const FIELD_UNITS = 'u'

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

/** Fixed table for the same reason `WEEKDAYS` is one — the server's locale must not reach the label. */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * `Thu 4 Sep` for a `YYYY-MM-DD` local calendar day, or the date itself when it
 * is not one — an unrecognised string is shown as it is rather than replaced by
 * a guess.
 */
export function dayLabel(localDate: string): string {
  const weekday = weekdayLabel(localDate)
  if (weekday === null) return localDate
  const at = new Date(`${localDate}T00:00:00Z`)
  const month = MONTHS[at.getUTCMonth()]
  if (month === undefined) return localDate
  return `${weekday} ${at.getUTCDate()} ${month}`
}

/**
 * How old the data is, in words.
 *
 * Trap 6 of the plan: a panel served from a stored run has to say so. A run from
 * the future — a clock skew between this process and the one that stored it —
 * reads as "just now" rather than as a negative age.
 */
export function formatAge(fetchedAt: Date | null, now: Date): string | null {
  if (fetchedAt === null) return null
  const minutes = Math.floor((now.getTime() - fetchedAt.getTime()) / 60_000)
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ${minutes % 60}m ago` : `${Math.floor(hours / 24)}d ago`
}

/** `fetched 14:05Z`, never `12Z run` — Probe A found no run time is exposed at all. */
function fetchedLine(fetchedAt: Date | null, now: Date): string {
  if (fetchedAt === null) return 'No fetch time recorded.'
  const stamp = `${String(fetchedAt.getUTCHours()).padStart(2, '0')}:${String(
    fetchedAt.getUTCMinutes(),
  ).padStart(2, '0')}Z`
  const age = formatAge(fetchedAt, now)
  return age === null ? `fetched ${stamp}` : `fetched ${stamp} · ${age}`
}

/** A `<pre>` block. Escaped inside, because "Bear &amp; Cub" is a 400 in a code block too. */
function pre(body: string): string {
  return `<pre>${escapeTelegramHtml(body)}</pre>`
}

/**
 * The day pager: previous, the day itself, next.
 *
 * The arrows are omitted at the ends rather than disabled — Probe B run 1 found
 * a `DisabledButton` draws exactly like an enabled one on both clients tested,
 * so a disabled arrow would be a button that silently does nothing.
 */
function dayRow(
  stateId: string,
  days: readonly string[],
  index: number,
): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = []

  const step = (i: number, decorate: (label: string) => string): void => {
    const date = days[i]
    if (date === undefined) return
    const data = encodeAction(VERB_SET, stateId, FIELD_DAY, String(i))
    if (data === null) return
    row.push({ text: decorate(weekdayLabel(date) ?? date), callback_data: data })
  }

  if (index > 0) step(index - 1, (label) => `◀ ${label}`)

  const current = days[index]
  // The middle of the pager names the day on screen. Telegram has no
  // non-button, so it carries `refresh` — redrawing what it names is the honest
  // behaviour for a control that cannot do nothing.
  const refresh = encodeAction(VERB_REFRESH, stateId)
  if (current !== undefined && refresh !== null) {
    row.push({ text: dayLabel(current), callback_data: refresh })
  }

  if (index < days.length - 1) step(index + 1, (label) => `${label} ▶`)

  return row
}

/** One button per model that answered, current one marked. */
function modelRow(
  stateId: string,
  models: readonly string[],
  selected: string,
): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = []
  for (const model of models) {
    const data = encodeAction(VERB_SET, stateId, FIELD_MODEL, model)
    if (data === null) continue
    const label = modelLabel(model)
    row.push({ text: model === selected ? `• ${label}` : label, callback_data: data })
  }
  return row
}

function intervalRow(
  stateId: string,
  selected: IntervalHours,
): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = []
  for (const hours of INTERVAL_HOURS) {
    const data = encodeAction(VERB_SET, stateId, FIELD_INTERVAL, String(hours))
    if (data === null) continue
    row.push({ text: hours === selected ? `• ${hours}h` : `${hours}h`, callback_data: data })
  }
  return row
}

function columnRow(stateId: string, selected: ColumnSet): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = []
  for (const key of COLUMN_SET_KEYS) {
    const data = encodeAction(VERB_SET, stateId, FIELD_COLUMNS, key)
    if (data === null) continue
    const label = COLUMN_SETS[key].label
    row.push({ text: key === selected ? `• ${label}` : label, callback_data: data })
  }
  return row
}

/** A toggle, so it names the units it would switch **to**. */
function unitsButton(stateId: string, units: TableUnits): InlineKeyboardButton | null {
  const next: TableUnits = units === 'imperial' ? 'metric' : 'imperial'
  const data = encodeAction(VERB_SET, stateId, FIELD_UNITS, next)
  return data === null ? null : { text: next === 'metric' ? '°C / mm' : '°F / in', callback_data: data }
}

function modeButton(stateId: string, mode: PanelMode): InlineKeyboardButton | null {
  const data = encodeAction(VERB_MODE, stateId, 'm', mode === 'advanced' ? 'simple' : 'advanced')
  return data === null
    ? null
    : { text: mode === 'advanced' ? '◀ Simple' : '⚙ Advanced', callback_data: data }
}

/**
 * The three views of one location. The current one is left out rather than
 * marked: it is the only button on the panel that would do nothing.
 */
function locationViewRow(
  stateId: string,
  current: 'conditions' | 'forecast' | 'rain',
): InlineKeyboardButton[] {
  const views: { view: 'conditions' | 'forecast' | 'rain'; label: string }[] = [
    { view: 'conditions', label: '🧗 Conditions' },
    { view: 'forecast', label: '📊 Forecast' },
    { view: 'rain', label: '🌧 Rain' },
  ]
  const row: InlineKeyboardButton[] = []
  for (const { view, label } of views) {
    if (view === current) continue
    const data = encodeAction(VERB_VIEW, stateId, 'v', view)
    if (data === null) continue
    row.push({ text: label, callback_data: data })
  }
  return row
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

  const toggle = modeButton(stateId, mode)

  return {
    text: parts.join('\n'),
    keyboard: keyboardOf([
      toggle === null ? [] : [toggle],
      locationViewRow(stateId, 'conditions'),
      navRow(stateId, null),
    ]),
  }
}

export type ForecastPanelInput = {
  readonly stateId: string
  readonly mode: PanelMode
  readonly locationName: string
  readonly units: TableUnits
  readonly interval: IntervalHours
  readonly columnSet: ColumnSet
  /** The model on screen. Always one that answered — the caller resolves it before building. */
  readonly model: string
  /** Local calendar days there is data for, in order. */
  readonly days: readonly string[]
  readonly dayIndex: number
  /** The selected day's rows, or empty when this model does not reach the day. */
  readonly rows: readonly ForecastRow[]
  readonly modelsAvailable: readonly string[]
  readonly modelsUnavailable: readonly string[]
  readonly probabilityIsShared: boolean | null
  /** The ensemble's view of the same day, for the agreement bar. `null` when the ensemble could not be read. */
  readonly rainDay: RainDay | null
  readonly fetchedAt: Date | null
  readonly now: Date
}

/**
 * The `/forecast` panel: one model, one day, one step.
 *
 * The parts that are not obvious from the code:
 *
 * - **A model with no hours for the day says so in a sentence.** Twenty-four
 *   rows of em dashes are technically honest and unreadable; HRRR reaching 54 h
 *   is the normal case, not an error.
 * - **Models that answered with nothing are named**, in the text, as a line
 *   rather than a button. `DisabledButton` draws identically to an enabled one
 *   on both clients Probe B tested, so a greyed-out model button would be a lie
 *   the user can tap.
 * - **The agreement bar is the ensemble's, and it is labelled as the
 *   ensemble's** — it is not this model's opinion and must not be read as one.
 */
export function buildForecastPanel(input: ForecastPanelInput): Panel {
  const day = input.days[input.dayIndex]
  // No model answered at all. "no model" is a fact; an empty segment would read
  // as a rendering fault, and naming one that did not answer is the attribution
  // defect.
  const model = input.model === '' ? 'no model' : modelLabel(input.model)
  const lines = [
    `<b>${escapeTelegramHtml(input.locationName)}</b> · ${escapeTelegramHtml(model)} · ${escapeTelegramHtml(`${input.interval}-hourly`)}`,
    escapeTelegramHtml(
      `${day === undefined ? 'No day selected' : dayLabel(day)} · ${fetchedLine(input.fetchedAt, input.now)}`,
    ),
    '',
  ]

  /**
   * A day the model does not reach is **rows whose values are all gaps**, not an
   * empty array and not absent rows: Open-Meteo pads a 54 h model out to the
   * longest horizon in the request, so those hours arrive as real rows full of
   * nulls. Asking only whether the array is empty would put a table of em dashes
   * on screen and leave the sentence below unreachable from the only caller
   * there is. See `dayHasData`.
   */
  const table = dayHasData(input.rows)
    ? renderTable({ rows: input.rows, columnSet: input.columnSet, units: input.units })
    : null
  if (table === null) {
    lines.push(
      escapeTelegramHtml(
        day === undefined
          ? 'No forecast days are available for this point yet.'
          : `${model} does not reach ${dayLabel(day)}.`,
      ),
    )
  } else {
    lines.push(pre(table), escapeTelegramHtml(stepNote(input.interval)))
    const note = probabilityNote(input.columnSet, input.probabilityIsShared)
    if (note !== null) lines.push(escapeTelegramHtml(note))
  }

  if (input.rainDay !== null) {
    const odds = input.rainDay.rows.map((r) => r.odds_pct)
    // Omitted rather than drawn flat when no member reached the day: a row of
    // low bars is a forecast of no rain, and no members is not a forecast.
    if (odds.some((o) => o !== null)) {
      // Named as the ensemble's, because the panel is headed with one
      // deterministic model and this bar is not that model's opinion.
      lines.push(
        '',
        escapeTelegramHtml(`Rain odds · ensemble, ${membersLabel(input.rainDay)}`),
        pre(sparkline(odds, 100)),
      )
    }
  }

  if (input.modelsUnavailable.length > 0) {
    lines.push(
      '',
      escapeTelegramHtml(
        `No data at this point: ${input.modelsUnavailable.map(modelLabel).join(', ')}`,
      ),
    )
  }

  const rows: InlineKeyboardButton[][] = [
    dayRow(input.stateId, input.days, input.dayIndex),
    modelRow(input.stateId, input.modelsAvailable, input.model),
  ]

  if (input.mode === 'advanced') {
    rows.push(intervalRow(input.stateId, input.interval))
    rows.push(columnRow(input.stateId, input.columnSet))
  }

  rows.push(advancedRow(input.stateId, input.mode, input.units))
  rows.push(locationViewRow(input.stateId, 'forecast'))
  rows.push(navRow(input.stateId, null))

  return { text: lines.join('\n'), keyboard: keyboardOf(rows) }
}

/** The Advanced toggle, and the unit toggle beside it once Advanced is open. */
function advancedRow(
  stateId: string,
  mode: PanelMode,
  units: TableUnits,
): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = []
  const toggle = modeButton(stateId, mode)
  if (toggle !== null) row.push(toggle)
  if (mode === 'advanced') {
    const unit = unitsButton(stateId, units)
    if (unit !== null) row.push(unit)
  }
  return row
}

/**
 * "143 members" or "94–143 members".
 *
 * The count falls as models reach their horizons, so a single number would be
 * true only for part of the day. A day with no members at all is named as such
 * rather than given a count of zero.
 */
function membersLabel(day: RainDay): string {
  if (day.member_min === null || day.member_max === null) return 'no members reach this day'
  return day.member_min === day.member_max
    ? `${day.member_max} members`
    : `${day.member_min}–${day.member_max} members`
}

export type RainPanelInput = {
  readonly stateId: string
  readonly mode: PanelMode
  readonly locationName: string
  readonly units: TableUnits
  readonly interval: IntervalHours
  readonly days: readonly string[]
  readonly dayIndex: number
  readonly day: RainDay
  readonly lastRain: LastRain | null
  /** True when the rainfall record could not be read — never rendered as a dry spell (#34). */
  readonly lastRainFailed: boolean
  readonly rainWindowDays: number
  /** The location's own today, for the "days ago" figure. */
  readonly today: string
  readonly fetchedAt: Date | null
  readonly now: Date
}

/**
 * The `/rain` panel: probability from the members themselves, accumulation
 * percentiles, when it lands, and when it last rained.
 *
 * The probability is `members_wet / member_count` and nothing else. The
 * per-model `precipitation_probability` field is not used here at all — Probe A
 * measured it running 276 h against a 54 h model and byte-identical between two
 * of them, so it belongs to no model and cannot be labelled with one.
 */
export function buildRainPanel(input: RainPanelInput): Panel {
  const date = input.days[input.dayIndex]
  const lines = [
    `<b>${escapeTelegramHtml(input.locationName)}</b> · ${escapeTelegramHtml('rain outlook')}`,
    escapeTelegramHtml(
      `${date === undefined ? 'No day selected' : dayLabel(date)} · ${membersLabel(input.day)} · ${fetchedLine(input.fetchedAt, input.now)}`,
    ),
    '',
  ]

  const table = renderRainTable(input.day, input.units)
  if (table === null) {
    lines.push(escapeTelegramHtml('No ensemble hours for this day.'))
  } else {
    lines.push(pre(table), escapeTelegramHtml(rainTableNote(input.interval)))
    const odds = input.day.rows.map((r) => r.odds_pct)
    if (odds.some((o) => o !== null)) lines.push(pre(sparkline(odds, 100)))
  }

  lines.push('', escapeTelegramHtml(timingLine(input.day, input.units)))
  lines.push(
    escapeTelegramHtml(
      formatLastRain(
        input.lastRain,
        input.lastRainFailed,
        input.rainWindowDays,
        input.today,
        input.units,
      ),
    ),
  )

  const rows: InlineKeyboardButton[][] = [dayRow(input.stateId, input.days, input.dayIndex)]
  if (input.mode === 'advanced') rows.push(intervalRow(input.stateId, input.interval))
  rows.push(advancedRow(input.stateId, input.mode, input.units))
  rows.push(locationViewRow(input.stateId, 'rain'))
  rows.push(navRow(input.stateId, null))

  return { text: lines.join('\n'), keyboard: keyboardOf(rows) }
}

/**
 * When the rain lands, and how much of it.
 *
 * Three genuinely different sentences. No members at all is not a dry day; a day
 * where every member stays under 0.1 mm **is** one, and it is worth saying
 * plainly rather than leaving a table of zeroes to imply it.
 */
export function timingLine(day: RainDay, units: TableUnits): string {
  if (day.peak_odds_pct === null) return 'No ensemble member reaches this day.'
  if (day.peak_hour === null) return 'No member has measurable rain on this day.'

  const hour = `${String(day.peak_hour).padStart(2, '0')}:00`
  // The day total is the sum of the hourly means — the one precipitation figure
  // here that can be added up. See `rainMessage.ts`.
  const amount = day.total_mm === null ? 'not available' : describePrecip(day.total_mm, units)
  return `Wettest around ${hour}, ${Math.round(day.peak_odds_pct)}% of members wet. Day total ${amount}.`
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
