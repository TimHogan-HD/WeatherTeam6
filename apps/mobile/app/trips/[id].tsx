import { useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { colors, spacing, fonts, radius } from '@weatherteam6/design/tokens'
import { useTrip } from '../../src/hooks/useTrip'
import { useTripForecast } from '../../src/hooks/useTripForecast'
import type { ForecastSnapshot, TripForecast } from '@weatherteam6/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function confidenceLevel(daysOut: number): { pct: number; label: 'High' | 'Medium' | 'Low' } {
  if (daysOut <= 7) return { pct: 85, label: 'High' }
  if (daysOut <= 14) return { pct: 55, label: 'Medium' }
  return { pct: 25, label: 'Low' }
}

function confidenceColor(label: 'High' | 'Medium' | 'Low'): string {
  if (label === 'High') return colors.good
  if (label === 'Medium') return colors.fair
  return colors.txt4
}

function confidenceNote(daysOut: number, label: 'High' | 'Medium' | 'Low'): string {
  if (label === 'High') return `${daysOut} days out — NWS point forecast is reliable for this range.`
  if (label === 'Medium') return `${daysOut} days out — ensemble models are available; moderate uncertainty.`
  return `${daysOut} days out — climatological normals only; significant uncertainty.`
}

function daysUntil(dateIso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateIso + 'T00:00:00')
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000))
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(s)} – ${fmt(e)}`
}

/** Generate every date (ISO YYYY-MM-DD) from startDate to endDate inclusive */
function tripDays(startDate: string, endDate: string): string[] {
  const days: string[] = []
  const cursor = new Date(startDate + 'T12:00:00')
  const end = new Date(endDate + 'T12:00:00')
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function dayCount(startDate: string, endDate: string): number {
  return tripDays(startDate, endDate).length
}

function formatDayTab(iso: string): { dow: string; date: string } {
  const d = new Date(iso + 'T12:00:00')
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
    date: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
  }
}

function formatDayName(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long' })
}

function formatFullDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Celsius → Fahrenheit, rounded */
function cToF(c: number | null): number | null {
  return c === null ? null : Math.round((c * 9) / 5 + 32)
}

/** mm → in, one decimal place */
function mmToIn(mm: number | null): string {
  if (mm === null) return '--'
  return (mm / 25.4).toFixed(2) + '"'
}

/** kph → mph, rounded */
function kphToMph(kph: number | null): number | null {
  return kph === null ? null : Math.round(kph * 0.621371)
}

/** Pick the best-matching ForecastSnapshot for a given date from an array */
function snapshotForDate(
  forecasts: ForecastSnapshot[],
  date: string,
): ForecastSnapshot | null {
  return forecasts.find(f => f.forecast_date === date) ?? null
}

/** Aggregate snapshots across all trip locations for a given date (use first-location data as primary) */
function aggForDate(
  forecastData: TripForecast[],
  date: string,
): ForecastSnapshot | null {
  for (const tf of forecastData) {
    const snap = snapshotForDate(tf.forecasts, date)
    if (snap) return snap
  }
  return null
}

/** Simple precip percentage from p50 mm (rough mapping: 0mm→0%, 25mm→100%) */
function precipPct(snap: ForecastSnapshot | null): number | null {
  if (!snap || snap.precip_mm_p50 === null) return null
  return Math.min(100, Math.round((snap.precip_mm_p50 / 25) * 100))
}

/** Condition icon stub based on precip probability */
function conditionIcon(pct: number | null): string {
  if (pct === null) return '🌤'
  if (pct >= 70) return '🌧'
  if (pct >= 40) return '🌦'
  if (pct >= 15) return '⛅'
  return '☀️'
}

/** Condition label based on precip probability */
function conditionLabel(pct: number | null): string {
  if (pct === null) return 'Data pending'
  if (pct >= 70) return 'Rain likely'
  if (pct >= 40) return 'Partly cloudy'
  if (pct >= 15) return 'Mostly clear'
  return 'Clear'
}

type BestDayResult = { date: string; reason: string }

/** Best day = lowest precip p50, tiebreak on highest temp_c_max */
function findBestDay(days: string[], forecastData: TripForecast[]): BestDayResult | null {
  if (days.length === 0) return null
  let best: string | null = null
  let bestPrecip = Infinity
  let bestTemp = -Infinity

  for (const day of days) {
    const snap = aggForDate(forecastData, day)
    const precip = snap?.precip_mm_p50 ?? Infinity
    const temp = snap?.temp_c_max ?? -Infinity
    if (
      precip < bestPrecip ||
      (precip === bestPrecip && temp > bestTemp)
    ) {
      best = day
      bestPrecip = precip
      bestTemp = temp
    }
  }

  return best ? { date: best, reason: 'Lowest precip forecast' } : null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopBarDetail() {
  return (
    <View style={s.topBar}>
      <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
        <Text style={s.backChevron}>‹</Text>
        <Text style={s.backLabel}>Trips</Text>
      </Pressable>
      <View style={s.topBarActions}>
        <Pressable style={s.iconBtn} hitSlop={12}>
          <Text style={s.iconBtnText}>✏️</Text>
        </Pressable>
        <Pressable style={s.iconBtn} hitSlop={12}>
          <Text style={s.iconBtnText}>⋯</Text>
        </Pressable>
      </View>
    </View>
  )
}

type HeroProps = {
  name: string
  startDate: string
  endDate: string
  locationCount: number
}

function Hero({ name, startDate, endDate, locationCount }: HeroProps) {
  const days = dayCount(startDate, endDate)
  return (
    <View style={s.hero}>
      <Text style={s.heroName}>{name}</Text>
      <Text style={s.heroMeta}>
        {formatDateRange(startDate, endDate)}
        {' · '}
        {days} {days === 1 ? 'day' : 'days'}
        {' · '}
        {locationCount} {locationCount === 1 ? 'location' : 'locations'}
      </Text>
    </View>
  )
}

type ConfidenceRowProps = {
  startDate: string
}

function ConfidenceRow({ startDate }: ConfidenceRowProps) {
  const daysOut = daysUntil(startDate)
  const conf = confidenceLevel(daysOut)
  const color = confidenceColor(conf.label)
  const note = confidenceNote(daysOut, conf.label)

  return (
    <View style={s.confCard}>
      <View style={s.confTop}>
        <View>
          <Text style={[s.confPct, { color }]}>{conf.pct}%</Text>
          <Text style={[s.confLabel, { color }]}>{conf.label} Confidence</Text>
        </View>
        <View style={s.confDaysOut}>
          <Text style={s.confDaysNum}>{daysOut}</Text>
          <Text style={s.confDaysLabel}>days out</Text>
        </View>
      </View>
      <Text style={s.confNote}>{note}</Text>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${conf.pct}%` as unknown as number, backgroundColor: color }]} />
      </View>
    </View>
  )
}

type DayTab = {
  date: string
  snap: ForecastSnapshot | null
  isBest: boolean
}

type DayTabsProps = {
  tabs: DayTab[]
  selectedDate: string
  onSelect: (date: string) => void
}

function DayTabs({ tabs, selectedDate, onSelect }: DayTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.dayTabsRow}
    >
      {tabs.map(tab => {
        const { dow, date } = formatDayTab(tab.date)
        const pct = precipPct(tab.snap)
        const highF = cToF(tab.snap?.temp_c_max ?? null)
        const isSelected = tab.date === selectedDate
        return (
          <Pressable
            key={tab.date}
            style={[s.dayTab, isSelected && s.dayTabSelected]}
            onPress={() => onSelect(tab.date)}
          >
            {tab.isBest && <Text style={s.bestDayTag}>Best</Text>}
            <Text style={[s.dayTabDow, isSelected && s.dayTabDowSelected]}>{dow}</Text>
            <Text style={[s.dayTabDate, isSelected && s.dayTabDateSelected]}>{date}</Text>
            <Text style={s.dayTabIcon}>{conditionIcon(pct)}</Text>
            <Text style={[s.dayTabHigh, isSelected && s.dayTabHighSelected]}>
              {highF !== null ? `${highF}°` : '--°'}
            </Text>
            <Text style={s.dayTabRain}>{pct !== null ? `${pct}%` : '--'}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

type SelectedDayWeatherProps = {
  date: string
  snap: ForecastSnapshot | null
  nwsOffice: string | null
}

function SelectedDayWeather({ date, snap, nwsOffice }: SelectedDayWeatherProps) {
  const highF = cToF(snap?.temp_c_max ?? null)
  const lowF = cToF(snap?.temp_c_min ?? null)
  const pct = precipPct(snap)
  const windMph = kphToMph(snap?.wind_kmh_max ?? null)
  const precipAmt = mmToIn(snap?.precip_mm_p50 ?? null)

  return (
    <View style={s.dayWeatherCard}>
      <Text style={s.dayWeatherDate}>{formatDayName(date)}, {formatFullDate(date)}</Text>

      {/* Temp hero */}
      <View style={s.tempHeroRow}>
        <Text style={s.tempHero}>{highF !== null ? `${highF}°F` : '--°'}</Text>
        <Text style={s.conditionLabel}>{conditionLabel(pct)}</Text>
      </View>

      <Text style={s.hiLo}>
        H: {highF !== null ? `${highF}°` : '--°'} · L: {lowF !== null ? `${lowF}°` : '--°'}
      </Text>

      <Text style={s.sourceLine}>
        {nwsOffice ? `NWS ${nwsOffice}` : 'Forecast data pending'}
      </Text>

      {/* Stat row */}
      <View style={s.statRow}>
        <StatCell label="Wind" value={windMph !== null ? `${windMph} mph` : '--'} />
        <StatCell label="Precip%" value={pct !== null ? `${pct}%` : '--'} />
        <StatCell label="Low" value={lowF !== null ? `${lowF}°F` : '--'} />
        <StatCell label="Precip amt" value={precipAmt} />
      </View>
    </View>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statCell}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function NWSForecastCard() {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>NWS Forecast</Text>
      <Text style={s.stubText}>Forecast text unavailable for this date range.</Text>
    </View>
  )
}

type DryingStatusCardProps = {
  rockType: string | null
}

function DryingStatusCard({ rockType }: DryingStatusCardProps) {
  return (
    <View style={s.card}>
      <View style={s.cardHeaderRow}>
        <Text style={s.cardTitle}>Drying Status</Text>
        <View style={s.pendingBadge}>
          <Text style={s.pendingBadgeText}>Pending</Text>
        </View>
      </View>
      {rockType && <Text style={s.rockTypeLabel}>{rockType}</Text>}
      <Text style={s.stubText}>
        Drying status pending — within forecast window.
      </Text>
      <View style={s.dryingTrack}>
        <View style={s.dryingTrackFill} />
      </View>
    </View>
  )
}

type AllDaysTableProps = {
  tabs: DayTab[]
}

function AllDaysTable({ tabs }: AllDaysTableProps) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>All Trip Days</Text>
      {tabs.map((tab, i) => {
        const { dow, date } = formatDayTab(tab.date)
        const highF = cToF(tab.snap?.temp_c_max ?? null)
        const lowF = cToF(tab.snap?.temp_c_min ?? null)
        const pct = precipPct(tab.snap)
        const windMph = kphToMph(tab.snap?.wind_kmh_max ?? null)

        return (
          <View
            key={tab.date}
            style={[
              s.allDayRow,
              i < tabs.length - 1 && s.allDayRowBorder,
              tab.isBest && s.allDayRowBest,
            ]}
          >
            <View style={s.allDayLeft}>
              <Text style={s.allDayDow}>{dow}</Text>
              <Text style={s.allDayDate}>{date}</Text>
              {tab.isBest && <Text style={s.bestTag}>Best day</Text>}
            </View>
            <View style={s.allDayStats}>
              <MiniStat label="High" value={highF !== null ? `${highF}°` : '--'} />
              <MiniStat label="Low" value={lowF !== null ? `${lowF}°` : '--'} />
              <MiniStat label="Rain" value={pct !== null ? `${pct}%` : '--'} />
              <MiniStat label="Wind" value={windMph !== null ? `${windMph}` : '--'} />
            </View>
          </View>
        )
      })}
    </View>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.miniStat}>
      <Text style={s.miniStatValue}>{value}</Text>
      <Text style={s.miniStatLabel}>{label}</Text>
    </View>
  )
}

type ForecastHistoryProps = {
  expanded: boolean
  onToggle: () => void
}

function ForecastHistory({ expanded, onToggle }: ForecastHistoryProps) {
  return (
    <View style={s.card}>
      <Pressable style={s.collapsibleHeader} onPress={onToggle}>
        <Text style={s.cardTitle}>Forecast History</Text>
        <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>
      {expanded && (
        <Text style={s.stubText}>
          Forecast snapshots will appear here as your trip date nears.
        </Text>
      )}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const tripId = Array.isArray(id) ? id[0] : id

  const { data: trip, isLoading: tripLoading, isError: tripError } = useTrip(tripId ?? '')
  const { data: forecastData = [] } = useTripForecast(tripId ?? '')

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [historyExpanded, setHistoryExpanded] = useState(false)

  const days = useMemo(
    () => (trip ? tripDays(trip.startDate, trip.endDate) : []),
    [trip],
  )

  const bestDay = useMemo(
    () => findBestDay(days, forecastData),
    [days, forecastData],
  )

  const tabs: DayTab[] = useMemo(
    () =>
      days.map(date => ({
        date,
        snap: aggForDate(forecastData, date),
        isBest: bestDay?.date === date,
      })),
    [days, forecastData, bestDay],
  )

  const activeDate = selectedDate ?? days[0] ?? null
  const activeSnap = activeDate ? aggForDate(forecastData, activeDate) : null

  const nwsOffice =
    trip?.locations && trip.locations.length > 0
      ? null // TripLocation only has locationId — Location detail (nws_office) not joined here
      : null

  const locationCount = trip?.locations?.length ?? 0
  const firstRockType: string | null = null // Phase 10 will join location data

  if (!tripId) {
    return (
      <LinearGradient
        colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
        style={s.gradient}
      >
        <SafeAreaView style={s.safe} edges={['top']}>
          <TopBarDetail />
          <View style={s.center}>
            <Text style={s.errorText}>Invalid trip ID</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  if (tripLoading) {
    return (
      <LinearGradient
        colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
        style={s.gradient}
      >
        <SafeAreaView style={s.safe} edges={['top']}>
          <TopBarDetail />
          <View style={s.center}>
            <ActivityIndicator color={colors.good} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  if (tripError || !trip) {
    return (
      <LinearGradient
        colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
        style={s.gradient}
      >
        <SafeAreaView style={s.safe} edges={['top']}>
          <TopBarDetail />
          <View style={s.center}>
            <Text style={s.errorText}>Could not load trip</Text>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={s.retryText}>Go back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={s.gradient}
    >
      <SafeAreaView style={s.safe} edges={['top']}>
        <TopBarDetail />
        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Hero
            name={trip.name}
            startDate={trip.startDate}
            endDate={trip.endDate}
            locationCount={locationCount}
          />

          <ConfidenceRow startDate={trip.startDate} />

          <DayTabs
            tabs={tabs}
            selectedDate={activeDate ?? ''}
            onSelect={date => setSelectedDate(date)}
          />

          {activeDate && (
            <SelectedDayWeather
              date={activeDate}
              snap={activeSnap}
              nwsOffice={nwsOffice}
            />
          )}

          <NWSForecastCard />

          <DryingStatusCard rockType={firstRockType} />

          <AllDaysTable tabs={tabs} />

          <ForecastHistory
            expanded={historyExpanded}
            onToggle={() => setHistoryExpanded(v => !v)}
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backChevron: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.txt1,
    lineHeight: 28,
    marginTop: -2,
  },
  backLabel: {
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.txt1,
  },
  topBarActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.chipMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 16 },

  // Hero
  hero: {
    paddingHorizontal: spacing.screenH,
    paddingTop: 20,
    paddingBottom: 4,
  },
  heroName: {
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: '700',
    color: colors.txt1,
    textTransform: 'uppercase',
    letterSpacing: 0.52,
  },
  heroMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.txt3,
    marginTop: 5,
  },

  // Confidence row
  confCard: {
    marginHorizontal: spacing.screenH,
    marginTop: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
  },
  confTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  confPct: { fontFamily: fonts.display, fontSize: 28, fontWeight: '700', lineHeight: 30 },
  confLabel: { fontFamily: fonts.display, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 },
  confDaysOut: { alignItems: 'center' },
  confDaysNum: { fontFamily: fonts.display, fontSize: 24, fontWeight: '700', color: colors.txt2, lineHeight: 26 },
  confDaysLabel: { fontFamily: fonts.display, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: colors.txt4 },
  confNote: { fontFamily: fonts.body, fontSize: 12, color: colors.txt3, marginTop: 8, lineHeight: 17 },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(226,232,240,0.08)',
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: 2 },

  // Day tabs
  dayTabsRow: {
    paddingHorizontal: spacing.screenH,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 8,
  },
  dayTab: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    minWidth: 60,
  },
  dayTabSelected: {
    borderColor: colors.goodTintBorder,
    backgroundColor: colors.goodTint,
  },
  bestDayTag: {
    fontFamily: fonts.display,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.good,
    marginBottom: 2,
  },
  dayTabDow: { fontFamily: fonts.display, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.txt4 },
  dayTabDowSelected: { color: colors.good },
  dayTabDate: { fontFamily: fonts.display, fontSize: 12, fontWeight: '600', color: colors.txt3, marginTop: 2 },
  dayTabDateSelected: { color: colors.txt1 },
  dayTabIcon: { fontSize: 18, marginTop: 4 },
  dayTabHigh: { fontFamily: fonts.display, fontSize: 14, fontWeight: '700', color: colors.txt2, marginTop: 2 },
  dayTabHighSelected: { color: colors.txt1 },
  dayTabRain: { fontFamily: fonts.body, fontSize: 10, color: colors.rain, marginTop: 2 },

  // Selected day weather
  dayWeatherCard: {
    marginHorizontal: spacing.screenH,
    marginTop: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
  },
  dayWeatherDate: { fontFamily: fonts.display, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: colors.txt4 },
  tempHeroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
  tempHero: { fontFamily: fonts.display, fontSize: 42, fontWeight: '700', color: colors.txt1, lineHeight: 44 },
  conditionLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.txt2 },
  hiLo: { fontFamily: fonts.body, fontSize: 13, color: colors.txt3, marginTop: 4 },
  sourceLine: { fontFamily: fonts.body, fontSize: 11, color: colors.txt4, marginTop: 4 },
  statRow: { flexDirection: 'row', marginTop: 14, gap: 0 },
  statCell: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: fonts.display, fontSize: 16, fontWeight: '700', color: colors.txt1 },
  statLabel: { fontFamily: fonts.display, fontSize: 9, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.txt4, marginTop: 3 },

  // Generic card
  card: {
    marginHorizontal: spacing.screenH,
    marginTop: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.txt2,
    marginBottom: 10,
  },
  stubText: { fontFamily: fonts.body, fontSize: 13, color: colors.txt4, lineHeight: 18 },
  rockTypeLabel: { fontFamily: fonts.display, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.txt3, marginBottom: 6 },

  // Pending badge
  pendingBadge: {
    backgroundColor: 'rgba(246,173,85,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(246,173,85,0.28)',
    borderRadius: radius.tag,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 10,
  },
  pendingBadgeText: { fontFamily: fonts.display, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.fair },

  // Drying track stub
  dryingTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(226,232,240,0.08)',
    marginTop: 10,
    overflow: 'hidden',
  },
  dryingTrackFill: { width: '30%', height: 4, borderRadius: 2, backgroundColor: colors.fair },

  // All days table
  allDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  allDayRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  allDayRowBest: { backgroundColor: colors.goodTint, borderRadius: radius.inner, paddingHorizontal: 6 },
  allDayLeft: { width: 64 },
  allDayDow: { fontFamily: fonts.display, fontSize: 12, fontWeight: '700', color: colors.txt1, textTransform: 'uppercase', letterSpacing: 0.5 },
  allDayDate: { fontFamily: fonts.body, fontSize: 11, color: colors.txt3, marginTop: 1 },
  bestTag: { fontFamily: fonts.display, fontSize: 8, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.good, marginTop: 2 },
  allDayStats: { flex: 1, flexDirection: 'row' },
  miniStat: { flex: 1, alignItems: 'center' },
  miniStatValue: { fontFamily: fonts.display, fontSize: 13, fontWeight: '700', color: colors.txt1 },
  miniStatLabel: { fontFamily: fonts.display, fontSize: 8, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.txt4, marginTop: 2 },

  // Forecast history collapsible
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chevron: { fontFamily: fonts.display, fontSize: 11, color: colors.txt4 },

  // Error
  errorText: { fontFamily: fonts.body, fontSize: 14, color: colors.txt3 },
  retryText: { fontFamily: fonts.display, fontSize: 14, fontWeight: '600', color: colors.good },
})
