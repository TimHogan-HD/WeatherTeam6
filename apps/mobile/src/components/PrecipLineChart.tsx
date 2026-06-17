import { StyleSheet, Text, View } from 'react-native'
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg'
import { colors, spacing, type as t } from '@weatherteam6/design/tokens'
import type { ForecastSnapshot } from '@weatherteam6/types'
import { useForecast } from '../hooks/useForecast'

const LABELS = ['Now', '+12h', '+24h', '+36h', '+48h', '+60h', '+72h']
const W = 320
const H = 80
const ACCUM_Y_TOP = 44
const ACCUM_Y_BOT = 66
const PROB_Y_TOP = 8
const PROB_Y_BOT = 32
const DIVIDER_Y = 38

function toPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
}

function snapToPoints(
  snaps: ForecastSnapshot[],
  field: 'precip_mm_p50',
  yTop: number,
  yBot: number,
  maxVal: number,
): { x: number; y: number }[] {
  return LABELS.map((_, i) => {
    const s = snaps[i]
    const val = s?.[field] ?? 0
    const pct = maxVal > 0 ? Math.min(1, val / maxVal) : 0
    const x = (i / (LABELS.length - 1)) * W
    const y = yBot - pct * (yBot - yTop)
    return { x, y }
  })
}

type Props = { locationId: string }

export function PrecipLineChart({ locationId }: Props) {
  const { data, isPending } = useForecast(locationId)

  if (isPending) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Loading…</Text>
      </View>
    )
  }

  const snaps = data ?? []
  const maxMm = Math.max(5, ...snaps.map((s) => s.precip_mm_p50 ?? 0))

  const accumPoints = snapToPoints(snaps, 'precip_mm_p50', ACCUM_Y_TOP, ACCUM_Y_BOT, maxMm)
  const probPoints = LABELS.map((_, i) => {
    const x = (i / (LABELS.length - 1)) * W
    const pct = Math.min(1, (snaps[i]?.precip_mm_p50 ?? 0) / maxMm)
    const y = PROB_Y_BOT - pct * (PROB_Y_BOT - PROB_Y_TOP)
    return { x, y }
  })

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>72H Precipitation</Text>
      <Svg width="100%" height={H + 18} viewBox={`0 0 ${W} ${H + 18}`}>
        <Line x1={0} y1={DIVIDER_Y} x2={W} y2={DIVIDER_Y} stroke={colors.line} strokeWidth={1} />
        <Path
          d={toPath(probPoints)}
          stroke={colors.rain}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          fill="none"
        />
        <Path
          d={toPath(accumPoints)}
          stroke={colors.rain}
          strokeWidth={2}
          fill="none"
        />
        {LABELS.map((label, i) => (
          <SvgText
            key={i}
            x={(i / (LABELS.length - 1)) * W}
            y={H + 14}
            textAnchor="middle"
            fontSize={8}
            fill={colors.txt5}
          >
            {label}
          </SvgText>
        ))}
      </Svg>
      <View style={styles.legend}>
        <Text style={styles.legendItem}>— Accumulation (in)</Text>
        <Text style={styles.legendItem}>- - Probability (%)</Text>
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
    marginTop: 4,
  },
  legendItem: {
    ...t.bodySm,
  },
})
