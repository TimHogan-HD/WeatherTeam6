import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg'
import { colors, fonts, spacing, type as t } from '@weatherteam6/design/tokens'
import { useWeatherObservations } from '../../hooks/useWeatherObservations'
import { useHourlyForecast } from '../../hooks/useHourlyForecast'
import { DetailSheet } from './DetailSheet'
import {
  HeroRow,
  RangeBar,
  InfoGrid,
  SimpleLineChart,
  SectionLabel,
  HourlyDetailStrip,
} from './sharedComponents'

type Props = {
  visible: boolean
  locationId: string
  onDismiss: () => void
}

function beaufortCategory(spd: number): string {
  if (spd === 0) return 'Calm'
  if (spd <= 24) return 'Light to Moderate'  // BF1–5
  if (spd <= 38) return 'Strong'              // BF6–7
  return 'Near Gale+'                         // BF8+
}

function WindCompass({ deg }: { deg: number }) {
  const cx = 60
  const cy = 60
  const r = 50
  const rad = (deg * Math.PI) / 180
  // Arrow points from center toward the bearing (wind comes FROM that direction)
  const tipX = cx + r * 0.8 * Math.sin(rad)
  const tipY = cy - r * 0.8 * Math.cos(rad)

  return (
    <Svg width={120} height={120} viewBox="0 0 120 120">
      {/* Outer ring */}
      <Circle cx={cx} cy={cy} r={r} stroke={colors.line2} strokeWidth={1.5} fill="none" />
      {/* NESW labels */}
      <SvgText x={cx} y={16} textAnchor="middle" fontSize={10} fontFamily={fonts.display} fill={colors.poor}>N</SvgText>
      <SvgText x={cx} y={112} textAnchor="middle" fontSize={10} fontFamily={fonts.display} fill={colors.txt3}>S</SvgText>
      <SvgText x={108} y={64} textAnchor="middle" fontSize={10} fontFamily={fonts.display} fill={colors.txt3}>E</SvgText>
      <SvgText x={12} y={64} textAnchor="middle" fontSize={10} fontFamily={fonts.display} fill={colors.txt3}>W</SvgText>
      {/* Wind direction arrow: line from center toward the source bearing */}
      <Line
        x1={cx}
        y1={cy}
        x2={tipX}
        y2={tipY}
        stroke={colors.good}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {/* Center dot */}
      <Circle cx={cx} cy={cy} r={3} fill={colors.good} />
    </Svg>
  )
}

export function WindSheet({ visible, locationId, onDismiss }: Props) {
  const { data: obs } = useWeatherObservations(locationId)
  const { data: hourly } = useHourlyForecast(locationId)
  const { width } = useWindowDimensions()
  const chartW = width - spacing.screenH * 2

  const windSpeed = obs?.windSpeedMph ?? 0
  const windGust = obs?.windGustMph ?? 0
  const windDeg = obs?.windDirectionDeg ?? 0
  const windLabel = obs?.windDirectionLabel ?? '—'

  const chartData = hourly.length > 0 ? hourly.map((h) => h.windSpeedMph) : [windSpeed]

  const hourlyCells = hourly.map((h) => ({
    time: h.time,
    rows: [`${h.windSpeedMph} mph`, h.windDir],
  }))

  return (
    <DetailSheet visible={visible} title="Wind" onDismiss={onDismiss}>
      <HeroRow
        left={{ value: obs ? `${windSpeed} mph` : '—', subLabel: 'Sustained', definition: 'Current speed at station' }}
        right={{ value: obs ? `${windGust} mph` : '—', subLabel: 'Gusts', definition: 'Peak gust measured in last hour' }}
      />

      <View style={styles.compassRow}>
        <WindCompass deg={windDeg} />
        <Text style={styles.compassLabel}>
          {`Wind from ${windLabel}, ${windDeg}°`}
        </Text>
      </View>

      <SectionLabel text="Beaufort Scale" />
      <RangeBar
        min={0}
        max={70}
        value={windSpeed}
        gradientColors={[colors.good, colors.sun, colors.fair, colors.poor]}
        ticks={[
          { value: 0, label: 'Calm' },
          { value: 12, label: 'Breezy' },
          { value: 25, label: 'Strong' },
          { value: 47, label: 'Dangerous' },
        ]}
        width={chartW}
      />

      <SectionLabel text="Details" />
      <InfoGrid
        cells={[
          { value: beaufortCategory(windSpeed), label: 'Wind character' },
          { value: `${windSpeed >= 12 ? 'Above' : 'Below'} 12 mph threshold`, label: 'Drying threshold' },
          { value: windSpeed > 10 ? 'Wind chill active' : 'Minimal chill', label: 'Chill effect' },
          { value: obs ? `${windGust} mph` : '—', label: 'Peak gusts' },
        ]}
      />

      <SectionLabel text="24H Wind Speed" />
      <SimpleLineChart
        data={chartData}
        width={chartW}
        height={80}
        color={colors.good}
        nowIndex={0}
      />

      <SectionLabel text="Hourly" />
      <HourlyDetailStrip cells={hourlyCells} />
    </DetailSheet>
  )
}

const styles = StyleSheet.create({
  compassRow: {
    alignItems: 'center',
    marginBottom: spacing.sectionTop,
  },
  compassLabel: {
    ...t.bodySm,
    color: colors.txt3,
    marginTop: spacing.listGap,
  },
})
