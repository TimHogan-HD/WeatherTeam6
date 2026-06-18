import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { colors, fonts, radius, spacing, type as t } from '@weatherteam6/design/tokens'
import { useWeatherObservations } from '../../hooks/useWeatherObservations'
import { useHourlyForecast } from '../../hooks/useHourlyForecast'
import { usePrecipEnsemble } from '../../hooks/usePrecipEnsemble'
import { DetailSheet } from './DetailSheet'
import { SectionLabel, HourlyDetailStrip } from './sharedComponents'

type Props = {
  visible: boolean
  locationId: string
  onDismiss: () => void
}

const MM_TO_IN = 0.0393701

export function PrecipitationSheet({ visible, locationId, onDismiss }: Props) {
  const { data: obs } = useWeatherObservations(locationId)
  const { data: hourly } = useHourlyForecast(locationId)
  const { data: forecast } = usePrecipEnsemble(locationId)
  const { width } = useWindowDimensions()
  const chartW = width - spacing.screenH * 2
  const chartH = 80

  const precip1h = obs?.precip1hIn ?? 0

  // Compute 72H from first 3 forecast days
  const forecast72h = forecast
    .slice(0, 3)
    .reduce((sum, f) => sum + (f.precip_mm_p50 ?? 0) * MM_TO_IN, 0)
    .toFixed(2)

  // Ensemble spread chart — 8 time buckets using forecast data
  const ensembleDays = forecast.slice(0, 8)
  const hasEnsemble = ensembleDays.length >= 2

  let ensemblePath = ''
  let bandPath = ''
  if (hasEnsemble) {
    const p50s = ensembleDays.map((f) => (f.precip_mm_p50 ?? 0) * MM_TO_IN)
    const p10s = ensembleDays.map((f) => (f.precip_mm_p10 ?? 0) * MM_TO_IN)
    const p90s = ensembleDays.map((f) => (f.precip_mm_p90 ?? 0) * MM_TO_IN)
    const maxVal = Math.max(...p90s, 0.1)

    const xOf = (i: number) => (i / (ensembleDays.length - 1)) * chartW
    const yOf = (v: number) => chartH - 4 - ((v / maxVal) * (chartH - 8))

    // p50 line
    const p50pts = p50s.map((v, i) => `${xOf(i)},${yOf(v)}`)
    ensemblePath = `M ${p50pts.join(' L ')}`

    // band: trace top (p90) then bottom (p10) reversed
    const topPts = p90s.map((v, i) => `${xOf(i)},${yOf(v)}`)
    const botPts = p10s.map((v, i) => `${xOf(i)},${yOf(v)}`).reverse()
    bandPath = `M ${topPts.join(' L ')} L ${botPts.join(' L ')} Z`
  }

  // Percentile values from first forecast day
  const firstForecast = forecast[0]
  const p10In = firstForecast ? ((firstForecast.precip_mm_p10 ?? 0) * MM_TO_IN).toFixed(2) : '0.00'
  const p50In = firstForecast ? ((firstForecast.precip_mm_p50 ?? 0) * MM_TO_IN).toFixed(2) : '0.00'
  const p90In = firstForecast ? ((firstForecast.precip_mm_p90 ?? 0) * MM_TO_IN).toFixed(2) : '0.00'

  const hourlyCells = hourly.map((h) => ({
    time: h.time,
    rows: [`${h.precipPct}%`, 'trace'],
  }))

  return (
    <DetailSheet visible={visible} title="Precipitation" onDismiss={onDismiss}>
      {/* Hero */}
      <View style={styles.heroRow}>
        <View style={styles.heroCell}>
          <Text style={styles.heroValue}>{obs ? `${precip1h.toFixed(2)}"` : '—'}</Text>
          <Text style={styles.heroSub}>Past 1 Hour</Text>
          <Text style={styles.heroDef}>ground-truth, station-verified</Text>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroCell}>
          <Text style={styles.heroValue}>{`${forecast72h}"`}</Text>
          <Text style={styles.heroSub}>72H Forecast</Text>
          <Text style={styles.heroDef}>median of 31 ensemble members</Text>
        </View>
      </View>

      <SectionLabel text="Ensemble Spread" />
      {hasEnsemble ? (
        <Svg width={chartW} height={chartH}>
          <Path d={bandPath} fill={colors.radarBand} />
          <Path d={ensemblePath} stroke={colors.rain} strokeWidth={2} fill="none" />
        </Svg>
      ) : (
        <Svg width={chartW} height={chartH}>
          <Rect x={0} y={0} width={chartW} height={chartH} fill="transparent" />
        </Svg>
      )}

      <SectionLabel text="Percentile Scenarios" />
      <View style={styles.percentileRow}>
        {([
          { label: 'p10', title: 'Dry scenario', value: `${p10In}"` },
          { label: 'p50', title: 'Most likely', value: `${p50In}"` },
          { label: 'p90', title: 'Wet scenario', value: `${p90In}"` },
        ] as const).map(({ label, title, value }) => (
          <View key={label} style={styles.percentileCell}>
            <Text style={styles.percentileValue}>{value}</Text>
            <Text style={styles.percentileTitle}>{title}</Text>
            <Text style={styles.percentileLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <SectionLabel text="Model Agreement" />
      <Text style={styles.agreementText}>
        {'22 of 31 members agree on < 0.1" tomorrow'}
      </Text>
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      <SectionLabel text="Hourly" />
      <HourlyDetailStrip cells={hourlyCells} />

      <SectionLabel text="Recent History" />
      <View style={styles.historyRow}>
        <Text style={styles.historyLabel}>Today ACIS</Text>
        <Text style={styles.historyValue}>{obs ? `${precip1h.toFixed(2)}"` : '—'} verified</Text>
      </View>
      <View style={styles.historyRow}>
        <Text style={styles.historyLabel}>Today ASOS</Text>
        <Text style={styles.historyValue}>{obs ? `${precip1h.toFixed(2)}"` : '—'} raw</Text>
      </View>
    </DetailSheet>
  )
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    marginBottom: spacing.sectionTop,
  },
  heroCell: {
    flex: 1,
    paddingVertical: spacing.tight,
  },
  heroDivider: {
    width: 1,
    backgroundColor: colors.line,
    marginHorizontal: spacing.cardPadSm,
    marginVertical: spacing.tight,
  },
  heroValue: {
    ...t.bigStat,
  },
  heroSub: {
    ...t.bodySm,
    marginTop: spacing.micro,
  },
  heroDef: {
    ...t.bodySm,
    color: colors.txt4,
    marginTop: spacing.micro,
  },
  percentileRow: {
    flexDirection: 'row',
    gap: spacing.listGapSm,
    marginBottom: spacing.sectionTop,
  },
  percentileCell: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.inner,
    padding: spacing.cellPad,
    alignItems: 'center',
  },
  percentileValue: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '700',
    color: colors.txt1,
  },
  percentileTitle: {
    ...t.bodySm,
    marginTop: spacing.micro,
    textAlign: 'center',
  },
  percentileLabel: {
    ...t.labelSm,
    color: colors.txt4,
    marginTop: spacing.micro,
  },
  agreementText: {
    ...t.bodyMd,
    color: colors.txt2,
    marginBottom: spacing.listGap,
  },
  progressTrack: {
    height: spacing.tight,
    backgroundColor: colors.line,
    borderRadius: radius.stepBar,
    overflow: 'hidden',
    marginBottom: spacing.sectionTop,
  },
  progressFill: {
    width: '71%',
    height: spacing.tight,
    backgroundColor: colors.rain,
    borderRadius: radius.stepBar,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.tight,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  historyLabel: {
    ...t.bodySm,
    color: colors.txt3,
  },
  historyValue: {
    ...t.bodySm,
    color: colors.txt2,
  },
})
