import { StyleSheet, Text, View } from 'react-native'
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg'
import { colors, spacing, type as t } from '@weatherteam6/design/tokens'
import type { ForecastSnapshot } from '@weatherteam6/types'
import { useForecast } from '../hooks/useForecast'

const BUCKET_LABELS = ['Now', '+12h', '+24h', '+36h', '+48h', '+60h', '+72h']
const CHART_H = 80
const LABEL_H = 16
const SVG_H = CHART_H + LABEL_H + 4

type Bucket = {
  label: string
  p10: number
  p50: number
  p90: number
}

function snapsToBuckets(snaps: ForecastSnapshot[]): Bucket[] {
  const today = snaps.slice(0, 7)
  return BUCKET_LABELS.map((label, i) => {
    const s = today[i]
    return {
      label,
      p10: s?.precip_mm_p10 ?? 0,
      p50: s?.precip_mm_p50 ?? 0,
      p90: s?.precip_mm_p90 ?? 0,
    }
  })
}

type Props = { locationId: string }

export function EnsemblePrecipChart({ locationId }: Props) {
  const { data, isPending } = useForecast(locationId)

  if (isPending) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Loading forecast…</Text>
      </View>
    )
  }

  const buckets = snapsToBuckets(data ?? [])
  const maxMm = Math.max(10, ...buckets.map((b) => b.p90))
  const N = buckets.length

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>72H Precipitation</Text>
      <Svg width="100%" height={SVG_H} viewBox={`0 0 ${N * 40} ${SVG_H}`}>
        {buckets.map((b, i) => {
          const x = i * 40 + 8
          const barW = 24
          const rangeH = Math.max(2, ((b.p90 - b.p10) / maxMm) * CHART_H)
          const rangeY = CHART_H - ((b.p90 / maxMm) * CHART_H)
          const medH = Math.max(2, (b.p50 / maxMm) * CHART_H)
          const medY = CHART_H - medH
          return (
            <G key={i}>
              <Rect x={x} y={rangeY} width={barW} height={rangeH} fill={colors.rain} opacity={0.3} rx={2} />
              <Rect x={x + 4} y={medY} width={barW - 8} height={medH} fill={colors.rain} rx={2} />
              <SvgText x={x + barW / 2} y={SVG_H - 2} textAnchor="middle" fontSize={8} fill={colors.txt5}>
                {b.label}
              </SvgText>
            </G>
          )
        })}
      </Svg>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.rain }]} />
          <Text style={styles.legendLabel}>p50 median</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.rain, opacity: 0.3 }]} />
          <Text style={styles.legendLabel}>p10–p90 range</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.screenH,
    marginBottom: spacing.sectionTop,
  },
  sectionTitle: {
    ...t.label,
    marginBottom: 8,
  },
  placeholder: {
    paddingHorizontal: spacing.screenH,
    height: 80,
    justifyContent: 'center',
  },
  placeholderText: {
    ...t.bodyMd,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 12,
    height: 6,
    borderRadius: 2,
  },
  legendLabel: {
    ...t.bodySm,
  },
})
