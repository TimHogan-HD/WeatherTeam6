import { useState } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import type {
  ConditionsScore,
  ForecastSnapshot,
  HourlySeries,
  Location,
  RecentPrecip,
  Wall,
  WeatherAlert,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { stack } from '../theme/styles.js'
import { forecastSourceLabel, findToday, rainfallSourceLabel, severeAlertEvent } from '../lib/forecast.js'
import { AlertBanner } from './Alerts.js'
import { ReadingsSection } from './ReadingsSection.js'
import { SourcesFooter } from './SourcesFooter.js'
import { InlineError, Skeleton } from './States.js'
import { NowLine } from './NowLine.js'
import { DryingCard } from './DryingCard.js'
import { DailyList, type DailyMetric } from './DailyList.js'
import { LocationIdentity } from './LocationIdentity.js'
import { Segmented, type SegmentedOption } from './Segmented.js'
import { HourlySection } from './charts/HourlySection.js'
import { DayCharts } from './charts/DayCharts.js'
import { currentHour, dayIsDrawable } from './charts/hourlySeries.js'
import { TEMP_VIEW_H } from './charts/chartStyle.js'
import { useNow } from '../hooks/useNow.js'

/**
 * The detail screen: **Daily and Hourly tabs**, with the alert banner, the
 * identity block, today, the score and the sources footer outside them.
 *
 * **This reverses `miniapp-design-v1.md` §3's "one scroll, no internal tabs"**,
 * on the owner's 2026-09-04 decision. Phase 5 of the dataviz handoff rewrites
 * that section rather than leaving the two documents disagreeing.
 *
 * What stays outside the tabs, and why it is not a layout preference: the alert
 * banner is above everything, always (§7 rule 5), and a tab is a place a reader
 * can be standing when a warning arrives. The score and the sources footer make
 * a claim about the whole location, not about one view of it.
 *
 * Shared by the saved detail screen and the add flow's preview step — the
 * preview is this screen in unsaved mode with its chrome swapped, which is why
 * `/add` is the only genuinely new screen in §12. **The preview has no tabs**:
 * it has no saved row, so `/hourly/:id` has nothing to read and a second tab
 * would open on an empty screen.
 *
 * Sections fail independently. A location whose alerts call failed still shows
 * its weather; the screen is never a whole-screen error takeover (§5).
 */

export type DetailViewProps = {
  /** Unsaved preview: no score section regardless of type — nothing has been classified yet. */
  unsaved?: boolean
  isClimbingLocation: boolean
  /** `null` on the preview path and on hand-entered coordinates. */
  asosStation: string | null

  forecast: {
    data: ForecastSnapshot[] | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  alerts?: {
    data: WeatherAlert[] | undefined
    /** Gates the score section: suppression cannot be decided before this settles. */
    isPending: boolean
    isError: boolean
  }
  conditions?: {
    /** A 200 with `data: null` is the documented "no row for today" answer, not an error (§5). */
    data: ConditionsScore | null | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  /**
   * The hourly charts **and the tabs that reach them**, which are one feature
   * and are therefore one prop.
   *
   * Absent together on the preview path, which has no saved row for
   * `/hourly/:locationId` to read. They are nested rather than sat side by side
   * because the two states that make sense are both-or-neither: hourly data
   * with no tabs would render no charts at all, silently, and tabs with no
   * hourly data would offer a second tab that can never have anything in it.
   * Neither mistake changes a type today; nesting makes both impossible.
   */
  hourly?: {
    data: HourlySeries | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
    /**
     * The open tab and the day open inside Hourly, held by the route.
     *
     * **Lifted out of this component on purpose.** Back is a per-route control
     * (§2), so the route is the thing that has to know whether back means "to
     * Daily" or "to the list". Tab state private to this component could not be
     * reached from there.
     */
    tabs: {
      active: DetailTab
      onTabChange: (tab: DetailTab) => void
      /** `null` until a day is picked, and when no day in the window is drawable. */
      selectedDate: string | null
      onSelectDate: (localDate: string) => void
    }
  }
  /**
   * The past few days' rainfall, for the drying card.
   *
   * Absent on the preview path, which has no saved row for the endpoint to read
   * coordinates from — the same reason `hourly` is absent there. Its own query
   * because it costs an upstream call and must not delay the rest of the page.
   */
  recentPrecip?: {
    data: RecentPrecip | undefined
    isPending: boolean
    isError: boolean
  }
  /**
   * The crag's named walls, for the identity block's strip.
   *
   * Not wrapped in query state like the others: an empty strip and a strip
   * still loading look identical, and the strip is one line of a card that has
   * already rendered. Absent on the preview path with everything else that
   * needs a saved row.
   */
  walls?: readonly Wall[]
  /**
   * The saved row behind this screen, for the identity block. Absent on the
   * preview path, which has a candidate rather than a row — it has no id, no
   * rock type and no rainfall station to show.
   */
  location?: Location
}

export type DetailTab = 'daily' | 'hourly'

const TAB_OPTIONS: readonly SegmentedOption<DetailTab>[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'hourly', label: 'Hourly' },
]

const TAB_PANEL_ID = 'detail-tab-panel'

/**
 * What tapping a day in Daily does: select that day, **then** open Hourly.
 *
 * A named function rather than an inline arrow because the order is the whole
 * behaviour and it is the phase's acceptance criterion. Switching the tab
 * without setting the date lands the reader on whichever day Hourly was already
 * showing — which looks exactly like the drill-down working, and is not. The
 * test environment here is `node` with no DOM (see `vitest.config.ts`), so an
 * inline arrow would be reachable by nothing.
 */
export function openDayInHourly(
  tabs: NonNullable<DetailViewProps['hourly']>['tabs'],
  localDate: string,
): void {
  tabs.onSelectDate(localDate)
  tabs.onTabChange('hourly')
}

export function DetailView({
  unsaved = false,
  isClimbingLocation,
  asosStation,
  forecast,
  alerts,
  conditions,
  hourly,
  recentPrecip,
  walls,
  location,
}: DetailViewProps) {
  const [metric, setMetric] = useState<DailyMetric>('temperature')
  const now = useNow()
  const today = findToday(forecast.data)
  const alertEvent = severeAlertEvent(alerts?.data)
  const showScore = !unsaved && isClimbingLocation
  const activeAlertCount = alerts?.data?.length ?? 0
  const tabs = hourly?.tabs
  // The hour covering right now, or null when the run does not reach it.
  const nowHour = hourly?.data === undefined ? null : currentHour(hourly.data.hours, now)
  const onHourly = tabs?.active === 'hourly'

  // Which daily rows open a drill-down. **Driven by `days[]`, not by the rows
  // themselves**: a forecast row exists for all seven days whatever the hourly
  // models reached, so tapping one the ensemble never covered would open two
  // empty charts.
  //
  // **Computed only once a response has arrived, and that distinction is the
  // point.** The set is also what tells `DailyList` to say "days without an
  // hour-by-hour forecast can't be opened" — a statement about the forecast. An
  // empty set derived from a request still in flight, or one that failed, turns
  // a loading spinner and a network error into that same confident claim, which
  // after an error is permanent. `/hourly/:id` is the slowest query on this
  // screen, so the in-flight window is not brief. Defect class 2: a failure
  // state that reads as a fact.
  const hourlyDays = hourly?.data?.days
  const drawableDates =
    hourlyDays === undefined
      ? undefined
      : new Set(hourlyDays.filter(dayIsDrawable).map((d) => d.local_date))

  // The drying card replaces the bare hours-since-rain line the hero used to
  // carry. It is shown **only for a climbing location** — a city has no drying
  // story (§3) — and only on Daily, because the Hourly tab's whole point is
  // that the charts get the screen.
  const showDrying = showScore && !onHourly

  const sources = [
    forecastSourceLabel(forecast.data),
    showScore ? rainfallSourceLabel(asosStation) : null,
    // Only claim NWS when an alert is actually being shown.
    //
    // An empty result is not "NWS says no alerts": `/alerts/:id` reads the
    // `weather_alerts` table, which is populated by a cron that is not yet
    // registered, so an empty array can equally mean NWS has never been asked.
    // Naming it then asserts a check that may not have happened. The bot uses
    // the same rule — the two must not disagree about the same location.
    activeAlertCount > 0 ? 'NWS' : null,
  ].filter((s): s is string => s !== null)

  return (
    <div style={{ ...stack(spacing.sectionGap), marginTop: `${spacing.sectionTop}px` }}>
      {alerts?.isError === true ? (
        // Alerts outrank everything (§7 rule 5), so their absence must be
        // visible rather than looking like "no alerts".
        <InlineError message="Couldn't load alerts." />
      ) : alerts?.data === undefined ? null : (
        <AlertBanner alerts={alerts.data} />
      )}

      {/*
        Identity leads: what this place *is*, before what the weather is doing
        to it. Condensed on Hourly so it stops competing with the charts.
      */}
      {location === undefined ? null : (
        <LocationIdentity location={location} walls={walls} condensed={onHourly} />
      )}

      {/*
        Current conditions as one line, not a 36px hero. The hero led with
        `temp_c_max` — a daily *maximum* — as the largest element on the screen;
        `NowLine` leads with the hour covering now, from the hourly run, which
        is the only field in any response entitled to the word.
      */}
      {forecast.isPending ? (
        <Skeleton height={64} />
      ) : forecast.isError ? (
        <InlineError message="Couldn't load the forecast." onRetry={forecast.refetch} />
      ) : today === null && nowHour === null ? (
        <p style={type.bodyMd}>No reading for today yet.</p>
      ) : (
        <NowLine hour={nowHour} today={today} />
      )}

      {/*
        **The two readings, at the top, on Daily only.**

        The score section this replaces was the last thing on the screen,
        collapsed, on the rule that a score should be prominent only where the
        reader scrolled to it deliberately (§3). The owner reversed that on
        2026-09-15: it is the question the app exists to answer and it sat below
        four charts. Phase 3b then replaced the number with the readings it is
        derived from — see `ReadingsSection`.

        **Not on Hourly**, and that is not a layout preference. This is about
        *today*; the Hourly tab pages through seven days, and today's reading at
        the top of a screen showing Saturday is a claim about the wrong day. The
        pager carries that day's own readings instead.

        **Its data is `/conditions`, not `/hourly`, although both carry the same
        readings.** The list card reads `/conditions` too, and one endpoint for
        both is what stops a crag showing one number on the list and another on
        its own screen.
      */}
      {showScore && !onHourly && conditions !== undefined ? (
        // Waits on the alerts query as well as its own: the *number* is
        // suppressed under a Severe+ alert, and `severeAlertEvent` answers null
        // for a query in flight exactly as it does for "no alert". An alerts
        // error settles the query, and the readings are unaffected either way.
        conditions.isPending || alerts?.isPending === true ? (
          <Skeleton height={90} />
        ) : conditions.isError ? (
          <InlineError message="Couldn't load conditions." onRetry={conditions.refetch} />
        ) : conditions.data == null ? (
          // No row for today at all, which since #108 means the whole live
          // compute produced nothing. Distinct from a named unavailable reason,
          // which is a statement about the readings.
          <p style={type.bodyMd}>No conditions for today yet.</p>
        ) : conditions.data.readings === undefined ? (
          // **The field is absent, which is not the same as the model having
          // nothing to say.** It means this client is newer than the API it is
          // talking to — a window of minutes after a deploy. Rendering a named
          // reason here would blame the forecast model for our own release
          // ordering (defect class 3), so it renders nothing at all.
          null
        ) : (
          <ReadingsSection
            label="Conditions now"
            reading={conditions.data.readings.now}
            window={conditions.data.readings.today?.window ?? null}
            unavailableReason={conditions.data.readings.unavailable_reason}
            // The location's own clock, carried by the readings — never
            // borrowed from another query that may not have settled (#33).
            utcOffsetSeconds={conditions.data.readings.utc_offset_seconds}
            severeAlertEvent={alertEvent}
            // Already settled: the skeleton branch above holds this whole
            // section until the alerts query resolves, so reaching here means
            // `alertEvent` is a real answer rather than a query in flight.
            alertsPending={false}
          />
        )
      ) : null}

      {/*
        Rain and drying. **Outside the forecast branch above**, because it reads
        neither of that branch's two queries: a forecast that failed to load
        says nothing about whether it rained on Tuesday, and hiding the record
        because a different request failed is the whole-screen error takeover §5
        forbids.
      */}
      {showDrying && recentPrecip !== undefined ? (
        <DryingCard score={conditions?.data ?? null} recent={recentPrecip} />
      ) : null}

      {/*
        The tab bar exists only when there is a second tab to reach. Without
        `hourly` — the `/add` preview — a control offering "Hourly" would open
        a screen that cannot have any.
      */}
      {tabs === undefined ? null : (
        <Segmented
          as="tabs"
          label="Forecast detail"
          panelId={TAB_PANEL_ID}
          options={TAB_OPTIONS}
          value={tabs.active}
          onChange={tabs.onTabChange}
        />
      )}

      {/*
        On the preview path this is a plain wrapper: no id and no role. A
        `tabpanel` with no tablist is a lie about the page structure to a screen
        reader, and a fixed id on a component that can appear twice is a
        duplicate waiting to happen.
      */}
      <div {...(tabs === undefined ? {} : { id: TAB_PANEL_ID, role: 'tabpanel' })}>
        {onHourly ? (
          /*
            The charts fail on their own. `/hourly/:id` takes the cold path —
            six deterministic models and 143 ensemble members — for any location
            not collected since the last `collect-runs` run, so this is the
            slowest query on the screen and must not hold up the rest of it.
          */
          hourly === undefined ? null : hourly.isPending ? (
            <Skeleton height={TEMP_VIEW_H} />
          ) : hourly.isError ? (
            <InlineError message="Couldn't load the hourly forecast." onRetry={hourly.refetch} />
          ) : hourly.data === undefined ? null : (
            <div style={stack(spacing.sectionGap)}>
              {/*
                A window in which no day is drawable. Distinct from a failed
                request, which is the branch above: the response arrived and
                said the ensemble reached none of these days.
              */}
              {tabs === undefined || tabs.selectedDate === null ? (
                <p style={type.bodyMd}>No hour-by-hour forecast for this location yet.</p>
              ) : (
                <DayCharts
                  series={hourly.data}
                  selectedDate={tabs.selectedDate}
                  onSelectDate={tabs.onSelectDate}
                  {...(!showScore
                    ? {}
                    : {
                        score: {
                          severeAlertEvent: alertEvent,
                          alertsPending: alerts?.isPending === true,
                          showScore,
                        },
                      })}
                />
              )}
            </div>
          )
        ) : forecast.isPending || forecast.isError ? (
          // The daily rows share the forecast query with the hero above, which
          // has already said what went wrong. A second copy of the same error
          // reads as two failures.
          null
        ) : forecast.data === undefined || forecast.data.length === 0 ? null : (
          <>
            <DailyList
              days={forecast.data}
              metric={metric}
              onMetricChange={setMetric}
              showScoreMetric={showScore}
              {...(hourly?.data === undefined ? {} : { hourly: hourly.data })}
              {...(tabs === undefined || drawableDates === undefined
                ? {}
                : {
                    onSelectDay: (localDate: string) => openDayInHourly(tabs, localDate),
                    drawableDates,
                  })}
            />
            {/*
              The continuous seven-day series, **on Daily and not on Hourly.**
              It is a chart about comparing days, which is what this tab is for;
              on the Hourly tab it sat under one day's hours answering a
              question that tab does not ask, and pushed the charts that do
              answer it off the screen.
            */}
            {hourly?.data === undefined ? null : <HourlySection series={hourly.data} />}

            {/*
              Why the rows are not opening, when the reason is this section
              rather than the forecast. The Hourly tab shows the same failure
              with its retry; here it is one line, because the reader came for
              the daily rows and got them.
            */}
            {hourly?.isError === true ? (
              <InlineError
                message="Couldn't load the hour-by-hour forecast."
                onRetry={hourly.refetch}
              />
            ) : null}
          </>
        )}
      </div>

      <SourcesFooter sources={sources} />
    </div>
  )
}
