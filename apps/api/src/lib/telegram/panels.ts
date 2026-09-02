import { escapeTelegramHtml } from '@weatherteam6/types'
import { encodeAction } from './callbackData.js'
import { formatConditionsReply, type ConditionsReplyInput } from './conditionsMessage.js'
import { locationDeepLink, MINI_APP_DIRECT_LINK } from './deepLink.js'
import {
  barScaleNote,
  clockLabel,
  dayHasData,
  DETAIL_AIR_COLUMNS,
  DETAIL_WIND_COLUMNS,
  INTERVAL_HOURS,
  modelLabel,
  renderTable,
  SIMPLE_COLUMNS,
  stepNote,
  type ForecastColumn,
  type ForecastRow,
  type IntervalHours,
  type TableUnits,
} from './forecastTable.js'
import {
  describePrecip,
  formatLastRain,
  formatLastRainAt,
  rainDayHasData,
  rainTableNote,
  renderRainSpreadTable,
  renderRainTable,
  type LastRain,
  type RainDay,
  type RainEpisode,
} from './rainMessage.js'
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
 * ## The copy rules this file exists to keep
 *
 * The panel was rebuilt in September 2026 because the chat surface was
 * unreadable: thirteen buttons under an eight-line table, a header of
 * dot-separated metadata, and two footnote sentences per view. The plan doc's
 * original decision — *"the Mini App is the snapshot, the bot is the
 * instrument"* — was reversed by the owner. The bot answers the question; the
 * Mini App carries the depth.
 *
 * Three rules follow, and they are the point of the redesign:
 *
 * - **Plain language, not the vocabulary of the data source.** No p10/p50/p90,
 *   no "ensemble members", no "blended probability" on a default screen. A
 *   percentage is fine; a percentile is not. Where a precise term is genuinely
 *   the only honest one, it goes behind `⚙ More`.
 * - **At most three button rows, at most three buttons a row**, except the one
 *   opt-in `More` row. Controls must not outweigh content.
 * - **Nothing was deleted from the product, only from the first screen.** Every
 *   variable the old column sets carried is still rendered under `More`.
 *
 * ## Two escaping rules, and they are opposites
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
 * One verb for every "change one setting and redraw" button — the day, the step
 * and the units. They differ only in which field they name, and a verb each
 * would spend the 64-byte budget on saying the same thing three ways.
 */
export const VERB_SET = 'set'

export const FIELD_DAY = 'd'
export const FIELD_INTERVAL = 'iv'
export const FIELD_UNITS = 'u'

/**
 * The picker's location buttons, one field per view they open.
 *
 * **The field carries the destination, because the button is the only place it
 * can.** A picker opened by `/forecast` and one opened by `/conditions` render
 * identically, so without this every location button opened conditions — which
 * is exactly what "conditions and forecast are the same" meant when it was
 * reported from a real device.
 *
 * `open:a1b2c3d4:locf=<uuid>` is 55 bytes, inside the 64-byte ceiling.
 */
export const OPEN_FIELDS = {
  loc: 'conditions',
  locf: 'forecast',
  locr: 'rain',
} as const satisfies Record<string, 'conditions' | 'forecast' | 'rain'>

export type OpenField = keyof typeof OPEN_FIELDS

/** Which picker view opens which target, and therefore which field its buttons carry. */
export const PICK_VIEWS = {
  list: 'loc',
  pick_forecast: 'locf',
  pick_rain: 'locr',
} as const satisfies Record<string, OpenField>

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
function locationButton(
  stateId: string,
  choice: LocationChoice,
  field: OpenField,
): InlineKeyboardButton | null {
  const data = encodeAction(VERB_OPEN, stateId, field, choice.id)
  if (data === null) return null
  return { text: choice.name, callback_data: data }
}

/**
 * The Mini App button — a plain `url`, never `web_app`, for the reason
 * `deepLink.ts` documents at length: `startapp` is a Direct Link mechanism and a
 * `web_app` button does not deliver `start_param` at all.
 *
 * With a location it deep-links to that location's detail screen; without one it
 * opens the app on its list. It never returns `null`, because
 * `MINI_APP_DIRECT_LINK` is a constant — only the `startapp` parameter can fail
 * to build, and that degrades to the list rather than to no button.
 */
function openInAppButton(locationId: string | null): InlineKeyboardButton {
  const url = locationId === null ? null : locationDeepLink(locationId)
  return { text: '📲 Open in app', url: url ?? MINI_APP_DIRECT_LINK }
}

/**
 * The last row of every panel. Two buttons, always in the same place, so the way
 * out of a panel never moves.
 *
 * `⚠️ Alerts` lives only on the list panel. Active alerts are already printed in
 * full at the top of the conditions text and are never omitted for space, so a
 * button for them on every panel was a control competing with the thing it
 * pointed at.
 */
function footerRow(
  stateId: string,
  locationId: string | null,
  current: 'list' | 'other',
): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = [openInAppButton(locationId)]
  const target = current === 'list' ? 'alerts' : 'list'
  const data = encodeAction(VERB_VIEW, stateId, 'v', target)
  if (data !== null) {
    row.push(
      current === 'list'
        ? { text: '⚠️ Alerts', callback_data: data }
        : { text: '📋 Locations', callback_data: data },
    )
  }
  return row
}

/** `null` rather than `{ inline_keyboard: [] }` when nothing could be built — the message still sends. */
function keyboardOf(rows: InlineKeyboardButton[][]): InlineKeyboardMarkup | null {
  const populated = rows.filter((r) => r.length > 0)
  return populated.length === 0 ? null : { inline_keyboard: populated }
}

export function buildListPanel(
  stateId: string,
  choices: readonly LocationChoice[],
  field: OpenField = 'loc',
): Panel {
  // The heading says where the tap will land, so the picker is not three
  // identical screens that behave differently.
  const heading =
    field === 'locf'
      ? 'Hour by hour — pick a place'
      : field === 'locr'
        ? 'Rain — pick a place'
        : '<b>Your locations</b>'
  const lines = [field === 'loc' ? heading : `<b>${escapeTelegramHtml(heading)}</b>`, '']

  // The buttons *are* the list. Printing the names as bullets above them as
  // well put every location on screen twice, which was half the height of this
  // panel.
  //
  // **But the rule that a location is never silently missing still holds.** A
  // name whose id will not encode gets no button, and if the text said nothing
  // either the bot would be claiming the user does not have it. So the ones
  // that could not be drawn are named, and only those.
  const drawn = choices.map((c) => ({ choice: c, button: locationButton(stateId, c, field) }))
  const undrawable = drawn.filter((d) => d.button === null).map((d) => d.choice.name)

  if (choices.length === 0) {
    lines.push(escapeTelegramHtml('No saved locations yet. Open the app to add one.'))
  } else {
    lines.push(escapeTelegramHtml('Tap one to see how it is looking.'))
  }

  if (undrawable.length > 0) {
    lines.push(
      '',
      escapeTelegramHtml(
        `Saved but not tappable here: ${undrawable.join(', ')}. Open the app to reach ${
          undrawable.length === 1 ? 'it' : 'them'
        }.`,
      ),
    )
  }

  return {
    text: lines.join('\n'),
    // One per row: a location name is as long as the user made it, and two of
    // them side by side truncate to initials on a phone.
    keyboard: keyboardOf([
      ...drawn
        .map((d) => d.button)
        .filter((b): b is InlineKeyboardButton => b !== null)
        .map((b) => [b]),
      footerRow(stateId, null, 'list'),
    ]),
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
 * Re-exported from `forecastTable.ts`, where it lives so the tables and the
 * rain copy can both reach it without importing this module — `panels.ts`
 * already imports them, and the other direction would be a cycle.
 */
export { clockLabel }

/** How wide the temperature bar is on the hourly panel. */
const TEMP_BAR_WIDTH = 9

/**
 * An hour for a *sentence*, always a string. `clockLabel` returns `null` for a
 * non-hour so a caller can omit a phrase; a table row and the last-rain line
 * need something to print, and the 24-hour form is a worse answer than `3pm`
 * but a much better one than `NaNpm`.
 */
function formatClockHour(hour: number): string {
  return clockLabel(hour) ?? `${String(hour).padStart(2, '0')}:00`
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

/**
 * The source line, at the foot of the panel rather than in the header.
 *
 * **Attribution is kept, it is only moved.** Naming the model is correct — it is
 * derived from the run that was actually read — but `Red Rock · GFS · 3-hourly`
 * put the vocabulary of the data source in the first line the reader sees. The
 * fact belongs on the panel; it does not belong in the headline.
 *
 * `fetched 14:05Z`, never `12Z run` — Probe A found no run time is exposed at
 * all.
 */
function sourceLine(model: string, fetchedAt: Date | null, now: Date): string {
  const name = model === '' ? null : modelLabel(model)
  if (fetchedAt === null) {
    return name === null ? 'No fetch time recorded.' : `${name} model. No fetch time recorded.`
  }
  const stamp = `${String(fetchedAt.getUTCHours()).padStart(2, '0')}:${String(
    fetchedAt.getUTCMinutes(),
  ).padStart(2, '0')}Z`
  const age = formatAge(fetchedAt, now)
  const when = age === null ? `fetched ${stamp}` : `updated ${age} (${stamp})`
  return name === null ? when : `${name} model, ${when}`
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
function dayRow(stateId: string, days: readonly string[], index: number): InlineKeyboardButton[] {
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

function intervalRow(stateId: string, selected: IntervalHours): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = []
  for (const hours of INTERVAL_HOURS) {
    const data = encodeAction(VERB_SET, stateId, FIELD_INTERVAL, String(hours))
    if (data === null) continue
    row.push({ text: hours === selected ? `• ${hours}h` : `${hours}h`, callback_data: data })
  }
  return row
}

/** A toggle, so it names the units it would switch **to**. */
function unitsButton(stateId: string, units: TableUnits): InlineKeyboardButton | null {
  const next: TableUnits = units === 'imperial' ? 'metric' : 'imperial'
  const data = encodeAction(VERB_SET, stateId, FIELD_UNITS, next)
  return data === null
    ? null
    : { text: next === 'metric' ? '°C / mm' : '°F / in', callback_data: data }
}

/**
 * The one control that reveals everything the default screen leaves out.
 *
 * `PanelMode` is unchanged in the database — `advanced` is what `More` writes —
 * but it no longer means "a second tier of the same interface". It means the
 * detail columns, the step picker and the unit toggle appear.
 */
function moreButton(stateId: string, mode: PanelMode): InlineKeyboardButton | null {
  const data = encodeAction(VERB_MODE, stateId, 'm', mode === 'advanced' ? 'simple' : 'advanced')
  return data === null
    ? null
    : { text: mode === 'advanced' ? '✕ Less' : '⚙ More', callback_data: data }
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
    { view: 'conditions', label: '🧗 Now' },
    { view: 'forecast', label: '⏱ Hourly' },
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
  readonly locationId: string | null
  readonly conditions: ConditionsReplyInput
}

/**
 * The answer panel. Three or four lines of prose and two rows of buttons.
 *
 * The text is `formatConditionsReply` unchanged — it is already built to
 * miniapp-design-v1.md §7, which puts weather first, never omits an alert for
 * space, and forbids the score being the headline. The redesign did not touch
 * it, because it was never the part that read badly.
 *
 * What went: the `⚙ Advanced` toggle and the seven-day outlook block it
 * revealed. The day-by-day view is the Mini App's, and the hourly panel's day
 * pager already walks the same week one day at a time.
 */
export function buildConditionsPanel(input: ConditionsPanelInput): Panel {
  const { stateId, locationId, conditions } = input
  const refresh = encodeAction(VERB_REFRESH, stateId)
  const viewRow = locationViewRow(stateId, 'conditions')
  if (refresh !== null) viewRow.push({ text: '🔄', callback_data: refresh })

  return {
    text: formatConditionsReply(conditions),
    keyboard: keyboardOf([viewRow, footerRow(stateId, locationId, 'other')]),
  }
}

export type ForecastPanelInput = {
  readonly stateId: string
  readonly locationId: string | null
  readonly mode: PanelMode
  readonly locationName: string
  readonly units: TableUnits
  readonly interval: IntervalHours
  /** The model on screen. Always one that answered — the caller resolves it before building. */
  readonly model: string
  /** Local calendar days there is data for, in order. */
  readonly days: readonly string[]
  readonly dayIndex: number
  /** The selected day's rows, or empty when this model does not reach the day. */
  readonly rows: readonly ForecastRow[]
  /** The ensemble's view of the same day, for the chance-of-rain bar. `null` when the ensemble could not be read. */
  readonly rainDay: RainDay | null
  readonly fetchedAt: Date | null
  readonly now: Date
}

/**
 * The `⏱ Hourly` panel: one day, one step, four columns.
 *
 * The parts that are not obvious from the code:
 *
 * - **A model with no hours for the day says so in a sentence.** Twenty-four
 *   rows of em dashes are technically honest and unreadable; a short-range model
 *   reaching 54 h is the normal case, not an error.
 * - **The chance-of-rain bar is the ensemble's**, and the source line says so —
 *   it is not the table's model's opinion and must not be read as one.
 * - **The model row is gone, and with it the "no data at this point" line.**
 *   Trap 5 forbids silently omitting a model that returned nothing *because a
 *   comparison would then overstate agreement*. This panel makes no comparison:
 *   it shows one model and names it. Model switching is the Mini App's.
 */
export function buildForecastPanel(input: ForecastPanelInput): Panel {
  const day = input.days[input.dayIndex]
  const detail = input.mode === 'advanced'
  // No model answered at all. "no model" is a fact; an empty segment would read
  // as a rendering fault, and naming one that did not answer is the attribution
  // defect.
  const modelName = input.model === '' ? 'no model' : modelLabel(input.model)
  const lines = [
    `<b>${escapeTelegramHtml(input.locationName)}</b> · ${escapeTelegramHtml(
      day === undefined ? 'No day selected' : dayLabel(day),
    )}`,
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
  const hasData = dayHasData(input.rows)
  const table = (columns: readonly ForecastColumn[]): string | null =>
    hasData ? renderTable({ rows: input.rows, columns, units: input.units }) : null

  const simple = hasData
    ? renderTable({
        rows: input.rows,
        columns: SIMPLE_COLUMNS,
        units: input.units,
        // The temperature bar. It replaced a standalone row of blocks that had
        // no axis, no scale and no labels — beside the number, in the row whose
        // clock time labels it, the same shape is readable without either.
        bar: { after: 'temp', width: TEMP_BAR_WIDTH },
      })
    : null
  if (simple === null) {
    lines.push(
      escapeTelegramHtml(
        day === undefined
          ? 'No forecast days are available for this point yet.'
          : `The ${modelName} model does not reach ${dayLabel(day)}.`,
      ),
    )
  } else if (detail) {
    // Two narrow tables, not one wide one. A single nine-column table is 50
    // characters and `<pre>` scrolls sideways rather than wrapping, which would
    // put half the numbers off the edge of a phone.
    const air = table(DETAIL_AIR_COLUMNS)
    const wind = table(DETAIL_WIND_COLUMNS)
    if (air !== null) lines.push(escapeTelegramHtml('Air'), pre(air))
    if (wind !== null) lines.push(escapeTelegramHtml('Wind and rain'), pre(wind))
    lines.push(escapeTelegramHtml(stepNote(input.interval)))
  } else {
    lines.push(pre(simple))
    // **The bar's scale is stated wherever the bar is drawn.** It is the day's
    // own range, not an absolute one, so without this the shape means nothing —
    // which is exactly what was wrong with the row of blocks it replaced.
    const scale = barScaleNote(input.rows, 'temp', input.units)
    if (scale !== null) lines.push(escapeTelegramHtml(scale))
    lines.push(escapeTelegramHtml(stepNote(input.interval)))
  }

  // The attribution is `⚙ More` only. It is derived, never guessed, and it is
  // still one tap away — but a model name and a member count under every
  // default panel is a footer the reader has already read, on a surface whose
  // whole problem was that the furniture outweighed the content.
  if (detail) {
    lines.push(
      '',
      escapeTelegramHtml(
        ensembleSourceSuffix(sourceLine(input.model, input.fetchedAt, input.now), input.rainDay),
      ),
    )
  } else {
    // Age stays on the default panel. It is the one piece of provenance that
    // changes what the reader should do: a three-hour-old panel is worth a tap
    // of 🔄, and a fresh one is not.
    const age = formatAge(input.fetchedAt, input.now)
    if (age !== null) lines.push('', escapeTelegramHtml(`Updated ${age}`))
  }

  const rows: InlineKeyboardButton[][] = [dayRow(input.stateId, input.days, input.dayIndex)]

  const viewRow = locationViewRow(input.stateId, 'forecast')
  const more = moreButton(input.stateId, input.mode)
  if (more !== null) viewRow.push(more)
  rows.push(viewRow)

  if (detail) {
    const settings = intervalRow(input.stateId, input.interval)
    const unit = unitsButton(input.stateId, input.units)
    if (unit !== null) settings.push(unit)
    rows.push(settings)
  }

  rows.push(footerRow(input.stateId, input.locationId, 'other'))

  return { text: lines.join('\n'), keyboard: keyboardOf(rows) }
}

/**
 * The source line with the ensemble named when its bar was drawn.
 *
 * The bar comes from a different fetch than the table, so a single source line
 * naming only the deterministic model would attribute the bar to it — defect
 * class 3. The member count lives here rather than in the headline: it is the
 * evidence for the bar, not something the reader needs before they can read it.
 */
function ensembleSourceSuffix(base: string, rainDay: RainDay | null): string {
  if (rainDay === null) return base
  const odds = rainDay.rows.map((r) => r.odds_pct)
  if (!odds.some((o) => o !== null)) return base
  const members = membersLabel(rainDay)
  // A drawn bar always has at least one member behind it, so `null` here is
  // unreachable in practice — but naming a count that does not exist is the
  // attribution defect, so the sentence is dropped rather than fabricated.
  return members === null ? base : `${base}. Rain chance from ${members}`
}

/**
 * "143 forecasts" or "94–143 forecasts", or `null` when none reached the day.
 *
 * **"forecasts", not "ensemble members".** The number is what makes the
 * percentage trustworthy and a reader can use it without knowing the word: each
 * member is one run of the model with slightly different starting conditions,
 * i.e. one more forecast that either sees rain or does not.
 *
 * The count falls as models reach their horizons, so a single number would be
 * true only for part of the day.
 *
 * **`null`, not a sentence.** This used to return the phrase *"no forecasts
 * reach this day"*, which the rain panel dropped into `Based on ${...}` and
 * rendered as *"Based on no forecasts reach this day, just now"*. A noun phrase
 * and a sentence are not interchangeable, and the callers now branch instead of
 * interpolating. Caught by rendering the panel, not by a test.
 */
export function membersLabel(day: RainDay): string | null {
  if (day.member_min === null || day.member_max === null) return null
  return day.member_min === day.member_max
    ? `${day.member_max} forecasts`
    : `${day.member_min}–${day.member_max} forecasts`
}

export type RainPanelInput = {
  readonly stateId: string
  readonly locationId: string | null
  readonly mode: PanelMode
  readonly locationName: string
  readonly units: TableUnits
  readonly interval: IntervalHours
  readonly days: readonly string[]
  readonly dayIndex: number
  readonly day: RainDay
  readonly lastRain: LastRain | null
  /**
   * The last run of wet hours, when an hourly series reached it — preferred over
   * `lastRain`, because it can say *when* rather than only *which day*.
   *
   * `null` means the hourly window did not cover the rain (or could not be
   * read), and the daily `lastRain` answers instead. It is never a claim that
   * it did not rain.
   */
  readonly lastRainAt: RainEpisode | null
  /** True when the rainfall record could not be read — never rendered as a dry spell (#34). */
  readonly lastRainFailed: boolean
  readonly rainWindowDays: number
  /** The location's own today, for the "days ago" figure. */
  readonly today: string
  readonly fetchedAt: Date | null
  readonly now: Date
}

/**
 * The `🌧 Rain` panel: how likely, when, how much, and when it last rained.
 *
 * The probability is `members_wet / member_count` and nothing else. The
 * per-model `precipitation_probability` field is not used here at all — Probe A
 * measured it running 276 h against a 54 h model and byte-identical between two
 * of them, so it belongs to no model and cannot be labelled with one.
 *
 * The answer leads and the table follows. The percentiles that used to be three
 * of the six columns are behind `⚙ More`.
 */
export function buildRainPanel(input: RainPanelInput): Panel {
  const date = input.days[input.dayIndex]
  const detail = input.mode === 'advanced'
  const lines = [
    `<b>${escapeTelegramHtml(input.locationName)}</b> · ${escapeTelegramHtml(
      date === undefined ? 'No day selected' : dayLabel(date),
    )}`,
    '',
    escapeTelegramHtml(timingLine(input.day, input.units)),
    '',
  ]

  // No `else`. `renderRainTable` returns null exactly when the day has no data,
  // which is the case `timingLine` above has already stated — a second sentence
  // saying the same thing was the panel telling the reader twice.
  const table = renderRainTable(input.day, input.units, input.interval)
  if (table !== null) {
    // No standalone bar above the table any more. It drew the same values as an
    // unlabelled row of blocks; they are now a bar *inside* each row, where the
    // window labels the x and the percentage labels the y.
    lines.push(pre(table))
    if (detail) {
      // A second narrow table, not three more columns: the combined form
      // measured 36 characters against the phone width.
      const spread = renderRainSpreadTable(input.day, input.units, input.interval)
      if (spread !== null) {
        const unit = input.units === 'imperial' ? 'inches' : 'mm'
        lines.push(escapeTelegramHtml(`If it rains, how much (${unit})`), pre(spread))
      }
    }
    const note = rainTableNote(input.interval, detail)
    if (note !== null) lines.push(escapeTelegramHtml(note))
  }

  // **The clock time wins when an hourly series reached the rain.** "Last rain:
  // today" cannot distinguish rain that stopped at 3am from rain still falling
  // at 5pm, which are opposite answers to whether the rock has dried. The daily
  // lookup remains the fallback for rain older than the hourly window, and for
  // the failure case — which still reads differently from a dry spell (#34).
  lines.push(
    '',
    escapeTelegramHtml(
      input.lastRainAt !== null && !input.lastRainFailed
        ? formatLastRainAt(input.lastRainAt, input.today, input.units, formatClockHour)
        : formatLastRain(
            input.lastRain,
            input.lastRainFailed,
            input.rainWindowDays,
            input.today,
            input.units,
          ),
    ),
  )

  if (detail) {
    lines.push(escapeTelegramHtml(rainSourceLine(input.day, input.fetchedAt, input.now)))
  } else {
    const age = formatAge(input.fetchedAt, input.now)
    if (age !== null) lines.push(escapeTelegramHtml(`Updated ${age}`))
  }

  const rows: InlineKeyboardButton[][] = [dayRow(input.stateId, input.days, input.dayIndex)]

  const viewRow = locationViewRow(input.stateId, 'rain')
  const more = moreButton(input.stateId, input.mode)
  if (more !== null) viewRow.push(more)
  rows.push(viewRow)

  if (detail) {
    const settings = intervalRow(input.stateId, input.interval)
    const unit = unitsButton(input.stateId, input.units)
    if (unit !== null) settings.push(unit)
    rows.push(settings)
  }

  rows.push(footerRow(input.stateId, input.locationId, 'other'))

  return { text: lines.join('\n'), keyboard: keyboardOf(rows) }
}

/**
 * The rain panel's foot: what the numbers came from, and how old they are.
 *
 * Branches rather than interpolating, because "how many forecasts" has a
 * genuinely absent case and a count of zero would be a fabricated sample size.
 * When there is no count the line still carries the age — the panel was still
 * fetched, even if the day is past the ensemble's horizon.
 */
function rainSourceLine(day: RainDay, fetchedAt: Date | null, now: Date): string {
  const members = membersLabel(day)
  const age = formatAge(fetchedAt, now)
  if (members === null) return age === null ? 'No fetch time recorded.' : `Updated ${age}`
  return age === null ? `Based on ${members}.` : `Based on ${members}, updated ${age}`
}

/**
 * When the rain lands, how likely it is, and how much — the sentence the panel
 * leads with.
 *
 * Three genuinely different outcomes. No members at all is not a dry day; a day
 * where every member stays under 0.1 mm **is** one, and it is worth saying
 * plainly rather than leaving a table of zeroes to imply it.
 *
 * The hour is read aloud (`3pm`), and falls back to the 24-hour form only when
 * `clockLabel` refuses it — an hour outside 0–23 is not a time of day, and
 * printing `NaNpm` would be worse than printing the number.
 */
export function timingLine(day: RainDay, units: TableUnits): string {
  // **Not `peak_odds_pct === null`.** That test conflates two different states:
  // a day the ensemble never reached, and a day whose rows carry amounts but no
  // wet count — `members_wet` is nullable and null means *unknown*, so a run
  // stored before that column existed has real accumulation and no chance. The
  // old test reported the second as "no forecast reaches this day" while the
  // table underneath showed the amounts.
  if (!rainDayHasData(day)) return 'No forecast reaches this day yet.'

  // The day total is the sum of the hourly means — the one precipitation figure
  // here that can be added up. See `rainMessage.ts`.
  const amount =
    day.total_mm === null ? null : `about ${describePrecip(day.total_mm, units)} over the day`

  if (day.peak_odds_pct === null) {
    // Withheld, never 0%. A run with no wet count cannot say how likely it is.
    return amount === null
      ? 'No chance of rain was recorded for this day.'
      : `Expect ${amount}. No chance-of-rain figure was recorded.`
  }

  if (day.peak_hour === null) return 'No rain expected.'

  const hour = clockLabel(day.peak_hour) ?? `${String(day.peak_hour).padStart(2, '0')}:00`
  const chance = Math.round(day.peak_odds_pct)
  const first = `Rain most likely around ${hour} — ${chance}% chance.`
  return amount === null ? first : `${first} Expect ${amount}.`
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
        'Nothing on file for your locations. Alerts arrive from a background NWS check, so an empty list means none has been recorded — not that NWS was asked just now.',
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

  return { text: lines.join('\n'), keyboard: keyboardOf([footerRow(stateId, null, 'other')]) }
}

export function buildHelpPanel(stateId: string, helpText: string): Panel {
  return { text: helpText, keyboard: keyboardOf([footerRow(stateId, null, 'other')]) }
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
    keyboard: keyboardOf([footerRow(stateId, null, 'other')]),
  }
}

/**
 * The panel shown when rendering one failed — an upstream fetch that did not
 * answer, which the next tap may well survive.
 *
 * **The copy and the button it names live in the same function on purpose.**
 * They used to be a message string in `telegramWebhook.ts` and a keyboard built
 * here, and when the nav row lost its `🔄` in the plain-language rebuild the
 * text went on telling the user to tap a button that was no longer on the
 * message. Nothing could catch that: neither file was wrong on its own. Split
 * across two modules the mismatch is invisible, and together it is one
 * assertion.
 *
 * Distinct from `buildNoticePanel`, which carries no retry: refreshing a
 * deleted location re-renders the identical notice, and a button that visibly
 * does nothing is the thing `DisabledButton` was rejected for.
 */
export function buildRetryPanel(stateId: string): Panel {
  const retry = encodeAction(VERB_REFRESH, stateId)
  // No encodable retry means no button, so the copy must not promise one.
  const text =
    retry === null
      ? 'Could not load that just now. Send /locations to start again.'
      : 'Could not load that just now. Tap 🔄 to try again.'
  const row = retry === null ? [] : [{ text: '🔄 Try again', callback_data: retry }]
  return {
    text: escapeTelegramHtml(text),
    keyboard: keyboardOf([row, footerRow(stateId, null, 'other')]),
  }
}
