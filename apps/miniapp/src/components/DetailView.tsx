import { useRef, type ReactNode } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import type {
  DetailTabKey,
  Conditions,
  ForecastSnapshot,
  HourlySeries,
  Location,
  RangeF,
  RecentPrecip,
  Wall,
  WeatherAlert,
} from '@weatherteam6/types'
import { GUIDEBOOK_SOURCE_LABEL, RECENT_PRECIP_SOURCE_LABEL } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { navClearance, stack } from '../theme/styles.js'
import {
  findToday,
  forecastSourceLabel,
  severeAlertEvent,
} from '../lib/forecast.js'
import { useScreenRemainder } from '../hooks/useScreenRemainder.js'
import { AlertBanner } from './Alerts.js'
import { ConditionsNow } from './ConditionsNow.js'
import { SourcesFooter, type SourceEntry } from './SourcesFooter.js'
import { formatTickDate } from '../lib/logbook.js'
import { InlineError, Skeleton } from './States.js'
import { DailyList } from './DailyList.js'
import { LocationIdentity } from './LocationIdentity.js'
import { RockTab } from './RockTab.js'
import { CragTab, type CragTabProps } from './guidebook/CragTab.js'
import type { HeaderTab } from './DetailHeader.js'
import { OverviewTab } from './OverviewTab.js'
import { PrecipTab } from './PrecipTab.js'
import { DayCharts } from './charts/DayCharts.js'
import { dayIsDrawable } from './charts/hourlySeries.js'
import { TEMP_VIEW_H } from './charts/chartStyle.js'

/**
 * The detail screen's body: **Overview, Daily, Hourly, Precip, Rock and Crag tabs**,
 * from the WT6 Figma "V2" page, with the alert banner above them and the
 * sources footer below. The header band and its tab bar are the route's
 * (`DetailHeader`), because back has to be able to change the tab.
 *
 * - **Overview** — the Conditions now hero, today by the hour, the next three
 *   days' scores, and rain. Built to its V2 frame.
 * - **Daily** — the seven days as tinted rows, built to its V2 frame.
 * - **Hourly** — a chip per day, the open day's readings and good hours,
 *   then its charts. Built to its V2 frame.
 * - **Precip** — the past week's precipitation: its total, its events and a
 *   bar per day, from the Figma "Precipitation history" frame. Every saved
 *   location has one; a city had rain too.
 * - **Rock** — a field guide to the crag's rock (`RockTab`): what it is, how it
 *   formed and made its holds, rain and sun, and how to look after it, with the
 *   identity block (aspect, angle, rain station) last.
 * - **Crag** — the guidebook: the OpenBeta crag this location sits on, its
 *   grades and its walls, from the Figma "03 · Guidebook Flow" frame.
 *
 * A city has no Rock or Crag tab: it has no rock and no walls, and the header
 * already carries its elevation and coordinates.
 *
 * What stays outside the tabs, and why it is not a layout preference: the alert
 * banner is above everything, always (§7 rule 5), and a tab is a place a reader
 * can be standing when a warning arrives. The sources footer makes a claim
 * about the whole location, not about one view of it.
 *
 * **Without hourly data there are no tabs**: it shows the hero and the seven
 * days — the Daily tab without a pager.
 *
 * Sections fail independently. A location whose alerts call failed still shows
 * its weather; the screen is never a whole-screen error takeover (§5).
 */

export type DetailViewProps = {
  isClimbingLocation: boolean
  /** The reader's temperature range, for the score's reasons. Null while it loads. */
  rangeF?: RangeF
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
    data: Conditions | null | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
    failureCount?: number
  }
  /**
   * The hourly run **and the tabs that reach it**, which are one feature and
   * are therefore one prop.
   *
   * Optional only so a test can render without it; `LocationDetail` always passes it. Nested rather than side by side because the
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
   * The past week's precipitation, for the Precip tab and the drying card.
   * Optional only so a test can render without it; `LocationDetail` always passes it.
   */
  recentPrecip?: {
    data: RecentPrecip | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  /** The crag's named walls, for the identity block. Optional only so a test can render without it; `LocationDetail` always passes it. */
  walls?: readonly Wall[]
  /** The saved row behind this screen, for the Rock tab. Optional only so a test can render without it; `LocationDetail` always passes it. */
  location?: Location
  /** The OpenBeta guidebook, for the Crag tab. Optional only so a test can render without it; `LocationDetail` always passes it. */
  guidebook?: CragTabProps['guidebook'] & { onOpenWall: (wallId: string) => void }
}

/** The Next 7 days card's height (the V2 frame's 685), held open while the forecast loads on the Daily tab. */
const DAILY_H = 685

export type DetailTab = DetailTabKey

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
    { value: 'precip', label: 'Precip' },
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
  isClimbingLocation,
  rangeF = null,
  forecast,
  alerts,
  conditions,
  hourly,
  recentPrecip,
  walls,
  location,
  guidebook,
}: DetailViewProps) {
  const alertEvent = severeAlertEvent(alerts?.data)
  const alertsPending = alerts?.isPending === true
  const showScore = isClimbingLocation
  const activeAlertCount = alerts?.data?.length ?? 0
  const tabs = hourly?.tabs
  // Without hourly data there are no tabs: the hero and the seven days together.
  const active: DetailTab | null = tabs?.active ?? null
  const panelRef = useRef<HTMLDivElement>(null)
  const panelTop = useScreenRemainder(panelRef, active === 'overview')

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

  const sources: SourceEntry[] = [
    { label: 'Forecast', value: forecastSourceLabel(forecast.data) },
    // The Precip tab and the Overview's last rain read this, from a different
    // Open-Meteo call than the drying model's own rainfall. Named once it
    // arrived.
    { label: 'Precip', value: recentPrecip?.data === undefined ? null : RECENT_PRECIP_SOURCE_LABEL },
    // Only claim NWS when an alert is actually being shown. An empty result is
    // not "NWS says no alerts": the table is filled by a cron, so empty can
    // equally mean NWS was never asked.
    { label: 'Alerts', value: activeAlertCount > 0 ? 'NWS' : null },
    // Named only once a crag came back: a location with no guidebook, or one
    // still loading, has shown nothing of OpenBeta's.
    {
      label: 'Crag',
      value:
        guidebook?.data == null
          ? null
          : `${GUIDEBOOK_SOURCE_LABEL}, ${formatTickDate(guidebook.data.snapshot_date)}`,
    },
  ]

  /**
   * The hero. **Its readings are passed only for a scored location** — a
   * city has no rock. Their data is
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
      rangeF={rangeF}
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
        {/* The rows' score pills and rain chances come from the hourly run. */}
        {hourly?.isError === true ? (
          <InlineError message="Couldn't load the hour-by-hour forecast." onRetry={hourly.refetch} />
        ) : null}
      </>
    )

  let panel: ReactNode
  if (active === null) {
    panel = (
      <>
        {hero}
        {daily}
      </>
    )
  } else if (active === 'overview') {
    panel = (
      <>
        {hero}
        {hourly === undefined || tabs === undefined ? null : (
          <OverviewTab
            fill={panelTop !== null}
            todayDate={findToday(forecast.data)?.forecast_date ?? null}
            isClimbingLocation={showScore}
            forecast={{ data: forecast.data }}
            hourly={hourly}
            recentPrecip={recentPrecip?.data}
            severeAlertEvent={alertEvent}
            alertsPending={alertsPending}
            drawableDates={drawableDates}
            onOpenDaily={() => tabs.onTabChange('daily')}
            onOpenHourly={() => tabs.onTabChange('hourly')}            onOpenDay={(localDate) => openDayInHourly(tabs, localDate)}
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
  } else if (active === 'precip') {
    panel =
      recentPrecip === undefined ? null : (
        <PrecipTab
          recent={recentPrecip}
          isClimbingLocation={showScore}
          {...(showScore && hourly?.data !== undefined
            ? { rock: { readings: hourly.data.readings, utcOffsetSeconds: hourly.data.utc_offset_seconds } }
            : {})}
        />
      )
  } else if (active === 'rock') {
    panel = (
      <RockTab
        rockType={location?.rock_type ?? null}
        identity={
          location === undefined ? null : <LocationIdentity location={location} walls={walls} condensed={false} />
        }
      />
    )
  } else {
    panel =
      guidebook === undefined || tabs === undefined ? null : (
        <CragTab
          guidebook={guidebook}
          conditions={conditions?.data}
          alerts={alerts?.data}
          alertsPending={alertsPending}
          onOpenOverview={() => tabs.onTabChange('overview')}
          onOpenWall={guidebook.onOpenWall}
        />
      )
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
        Without tabs this is a plain wrapper: no id and no role. A
        `tabpanel` with no tablist is a lie about the page structure to a screen
        reader.
      */}
      {/*
        **The Overview fills the screen** (owner, 2026-09-30): it is sized to
        fit one, so the sources and actions below it belong past the fold
        rather than ending the page halfway down with black under them. The
        spare height goes to the Today chart, never between sections: spread as
        gaps, it read as black bars on a tall phone.
      */}
      <div
        ref={panelRef}
        {...(tabs === undefined ? {} : { id: tabs.panelId, role: 'tabpanel' })}
        style={{
          ...stack(spacing.listGapLg),
          ...(panelTop === null
            ? {}
            : { minHeight: `calc(100dvh - ${panelTop}px - ${navClearance})` }),
        }}
      >
        {panel}
      </div>

      <SourcesFooter sources={sources} />
    </div>
  )
}
