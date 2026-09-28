import type { ReactNode } from 'react'
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
import {
  findToday,
  forecastSourceLabel,
  rainfallSourceLabel,
  severeAlertEvent,
} from '../lib/forecast.js'
import { AlertBanner } from './Alerts.js'
import { ConditionsNow } from './ConditionsNow.js'
import { SourcesFooter } from './SourcesFooter.js'
import { InlineError, Skeleton } from './States.js'
import { DryingCard } from './DryingCard.js'
import { DailyList } from './DailyList.js'
import { LocationIdentity } from './LocationIdentity.js'
import type { HeaderTab } from './DetailHeader.js'
import { OverviewTab } from './OverviewTab.js'
import { HourlySection } from './charts/HourlySection.js'
import { DayCharts } from './charts/DayCharts.js'
import { dayIsDrawable } from './charts/hourlySeries.js'
import { TEMP_VIEW_H } from './charts/chartStyle.js'

/**
 * The detail screen's body: **Overview, Daily, Hourly, Rock and Crag tabs**,
 * from the WT6 Figma "V2" page, with the alert banner above them and the
 * sources footer below. The header band and its tab bar are the route's
 * (`DetailHeader`), because back has to be able to change the tab.
 *
 * - **Overview** — the Conditions now hero, today by the hour, the next three
 *   days' scores, and rain. Built to its V2 frame.
 * - **Daily** — the seven days as tinted rows, built to its V2 frame, with the
 *   seven-day hourly strip under them.
 * - **Hourly** — the day charts, as they were. Its V2 frame is later work.
 * - **Rock** — the drying card; **Crag** — the identity block and its walls.
 *   Both hold the content that used to sit above the old two tabs, so nothing
 *   left the screen when Overview arrived. Their V2 frames are later work too.
 *
 * A city has no Rock or Crag tab: it has no rock and no walls, and the header
 * already carries its elevation and coordinates.
 *
 * What stays outside the tabs, and why it is not a layout preference: the alert
 * banner is above everything, always (§7 rule 5), and a tab is a place a reader
 * can be standing when a warning arrives. The sources footer makes a claim
 * about the whole location, not about one view of it.
 *
 * Shared by the saved detail screen and the add flow's preview step. **The
 * preview has no tabs**: it has no saved row, so `/hourly/:id` has nothing to
 * read. It shows the hero and the seven days — the Daily tab without a pager.
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
    /** Gates the score: suppression cannot be decided before this settles. */
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
   * The hourly run **and the tabs that reach it**, which are one feature and
   * are therefore one prop.
   *
   * Absent together on the preview path, which has no saved row for
   * `/hourly/:locationId` to read. Nested rather than side by side because the
   * two states that make sense are both-or-neither: hourly data with no tabs
   * would render no charts at all, silently, and tabs with no hourly data would
   * offer tabs that can never have anything in them.
   */
  hourly?: {
    data: HourlySeries | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
    /**
     * The open tab and the day open inside Hourly, held by the route — back is
     * a per-route control (§2), so the route has to know which tab it is on.
     */
    tabs: {
      active: DetailTab
      onTabChange: (tab: DetailTab) => void
      /** `null` until a day is picked, and when no day in the window is drawable. */
      selectedDate: string | null
      onSelectDate: (localDate: string) => void
      /** The id the header's tabs point `aria-controls` at. */
      panelId: string
    }
  }
  /**
   * The past few days' rainfall, for the drying card. Absent on the preview
   * path, which has no saved row for the endpoint to read coordinates from.
   */
  recentPrecip?: {
    data: RecentPrecip | undefined
    isPending: boolean
    isError: boolean
  }
  /** The crag's named walls, for the Crag tab. Absent on the preview path. */
  walls?: readonly Wall[]
  /** The saved row behind this screen, for the Crag tab. Absent on the preview path. */
  location?: Location
}

/** The Next 7 days card's height (the V2 frame's 685), held open while the forecast loads on the Daily tab. */
const DAILY_H = 685

export type DetailTab = 'overview' | 'daily' | 'hourly' | 'rock' | 'crag'

/**
 * The tabs a location offers. A city gets no Rock or Crag — there is nothing
 * of either to show, and a tab that opens onto an empty panel is a promise the
 * screen cannot keep.
 */
export function detailTabs(isClimbingLocation: boolean): readonly HeaderTab<DetailTab>[] {
  const all: HeaderTab<DetailTab>[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'daily', label: 'Daily' },
    { value: 'hourly', label: 'Hourly' },
  ]
  if (isClimbingLocation) {
    all.push({ value: 'rock', label: 'Rock' }, { value: 'crag', label: 'Crag' })
  }
  return all
}

/**
 * What tapping a day does: select that day, **then** open Hourly.
 *
 * A named function rather than an inline arrow because the order is the whole
 * behaviour. Switching the tab without setting the date lands the reader on
 * whichever day Hourly was already showing — which looks exactly like the
 * drill-down working, and is not. The test environment has no DOM, so an
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
  const alertEvent = severeAlertEvent(alerts?.data)
  const alertsPending = alerts?.isPending === true
  const showScore = !unsaved && isClimbingLocation
  const activeAlertCount = alerts?.data?.length ?? 0
  const tabs = hourly?.tabs
  // The preview has no tabs and shows the hero and the seven days together.
  const active: DetailTab | null = tabs?.active ?? null

  // Which days open a drill-down. **Driven by `days[]`, not by the rows
  // themselves**: a forecast row exists for all seven days whatever the hourly
  // models reached, so tapping one the ensemble never covered would open two
  // empty charts.
  //
  // **Computed only once a response has arrived.** The set also tells
  // `DailyList` to say "days without an hour-by-hour forecast can't be opened"
  // — a statement about the forecast. An empty set derived from a request still
  // in flight, or one that failed, turns a spinner or a network error into that
  // same confident claim (defect class 2).
  const hourlyDays = hourly?.data?.days
  const drawableDates =
    hourlyDays === undefined
      ? undefined
      : new Set(hourlyDays.filter(dayIsDrawable).map((d) => d.local_date))

  const sources = [
    forecastSourceLabel(forecast.data),
    showScore ? rainfallSourceLabel(asosStation) : null,
    // Only claim NWS when an alert is actually being shown. An empty result is
    // not "NWS says no alerts": the table is filled by a cron, so empty can
    // equally mean NWS was never asked.
    activeAlertCount > 0 ? 'NWS' : null,
  ].filter((s): s is string => s !== null)

  /**
   * The hero. **Its readings are passed only for a scored location** — the
   * preview has classified nothing and a city has no rock. Their data is
   * `/conditions`, not `/hourly`, because the list card reads `/conditions`
   * too, and one endpoint for both is what stops a crag showing one reading on
   * the list and another here.
   */
  const hero = (
    <ConditionsNow
      forecast={forecast}
      series={hourly?.data}
      {...(showScore && conditions !== undefined ? { conditions } : {})}
      alertsPending={alertsPending}
      severeAlertEvent={alertEvent}
    />
  )

  // The day scores the Daily rows wear — only for a scored location, and only
  // once `/hourly` has answered; until then the rows carry no pill.
  const dayReadings =
    showScore && hourly?.data !== undefined
      ? {
          days: hourly.data.readings?.days ?? [],
          utcOffsetSeconds: hourly.data.utc_offset_seconds,
          severeAlertEvent: alertEvent,
          alertsPending,
        }
      : null

  const daily =
    // The rows share the forecast query with the hero, which has already said
    // what went wrong. A second copy of the same error reads as two failures —
    // except on the Daily tab, where the hero is not on screen to say it.
    forecast.isPending ? (
      active === 'daily' ? <Skeleton height={DAILY_H} /> : null
    ) : forecast.isError ? (
      active === 'daily' ? (
        <InlineError message="Couldn't load the forecast." onRetry={forecast.refetch} />
      ) : null
    ) : forecast.data === undefined || forecast.data.length === 0 ? null : (
      <>
        <DailyList
          days={forecast.data}
          readings={dayReadings}
          hours={hourly?.data?.hours ?? []}
          {...(tabs === undefined || drawableDates === undefined
            ? {}
            : {
                onSelectDay: (localDate: string) => openDayInHourly(tabs, localDate),
                drawableDates,
              })}
        />
        {/*
          The continuous seven-day series belongs with the daily rows: it is a
          chart about comparing days, which is what this tab is for.
        */}
        {hourly?.data === undefined ? null : <HourlySection series={hourly.data} />}
        {hourly?.isError === true ? (
          <InlineError message="Couldn't load the hour-by-hour forecast." onRetry={hourly.refetch} />
        ) : null}
      </>
    )

  // Rain and drying. It reads neither the forecast nor the hourly run, so a
  // failure in either says nothing about whether it rained on Tuesday. Only
  // for a scored location, and only where the rain window was wired in.
  const drying =
    showScore && recentPrecip !== undefined ? (
      <DryingCard score={conditions?.data ?? null} recent={recentPrecip} />
    ) : null

  let panel: ReactNode
  if (active === null) {
    panel = (
      <>
        {hero}
        {drying}
        {daily}
      </>
    )
  } else if (active === 'overview') {
    panel = (
      <>
        {hero}
        {hourly === undefined || tabs === undefined ? null : (
          <OverviewTab
            todayDate={findToday(forecast.data)?.forecast_date ?? null}
            isClimbingLocation={showScore}
            forecast={{ data: forecast.data }}
            hourly={hourly}
            conditions={conditions?.data}
            severeAlertEvent={alertEvent}
            alertsPending={alertsPending}
            drawableDates={drawableDates}
            onOpenDaily={() => tabs.onTabChange('daily')}
            onOpenHourly={() => tabs.onTabChange('hourly')}
            onOpenDay={(localDate) => openDayInHourly(tabs, localDate)}
          />
        )}
      </>
    )
  } else if (active === 'daily') {
    panel = daily
  } else if (active === 'hourly') {
    /*
      The charts fail on their own. `/hourly/:id` takes the cold path — six
      deterministic models and 143 ensemble members — for any location not
      collected since the last `collect-runs`, so this is the slowest query on
      the screen and must not hold up the rest of it.
    */
    panel =
      hourly === undefined ? null : hourly.isPending ? (
        <Skeleton height={TEMP_VIEW_H} />
      ) : hourly.isError ? (
        <InlineError message="Couldn't load the hourly forecast." onRetry={hourly.refetch} />
      ) : hourly.data === undefined ? null : tabs === undefined || tabs.selectedDate === null ? (
        // The response arrived and said the ensemble reached none of these
        // days — distinct from a failed request, which is the branch above.
        <p style={type.bodyMd}>No hour-by-hour forecast for this location yet.</p>
      ) : (
        <DayCharts
          series={hourly.data}
          selectedDate={tabs.selectedDate}
          onSelectDate={tabs.onSelectDate}
          {...(!showScore
            ? {}
            : { score: { severeAlertEvent: alertEvent, alertsPending, showScore } })}
        />
      )
  } else if (active === 'rock') {
    panel = drying
  } else {
    panel = location === undefined ? null : <LocationIdentity location={location} walls={walls} condensed={false} />
  }

  return (
    <div style={stack(spacing.listGapLg)}>
      {alerts?.isError === true ? (
        // Alerts outrank everything (§7 rule 5), so their absence must be
        // visible rather than looking like "no alerts".
        <InlineError message="Couldn't load alerts." />
      ) : alerts?.data === undefined ? null : (
        <AlertBanner alerts={alerts.data} />
      )}

      {/*
        On the preview path this is a plain wrapper: no id and no role. A
        `tabpanel` with no tablist is a lie about the page structure to a screen
        reader.
      */}
      <div
        {...(tabs === undefined ? {} : { id: tabs.panelId, role: 'tabpanel' })}
        style={stack(spacing.listGapLg)}
      >
        {panel}
      </div>

      <SourcesFooter sources={sources} />
    </div>
  )
}
