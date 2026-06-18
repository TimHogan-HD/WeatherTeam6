import { useWindowDimensions } from 'react-native'
import { colors, spacing } from '@weatherteam6/design/tokens'
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

function skyCondition(pct: number): string {
  if (pct < 20) return 'Clear'
  if (pct < 50) return 'Partly Cloudy'
  if (pct < 90) return 'Mostly Cloudy'
  return 'Overcast'
}

function cloudTag(pct: number): string {
  if (pct < 20) return 'Clear'
  if (pct < 50) return 'Partly'
  if (pct < 90) return 'Cloudy'
  return 'Overcast'
}

export function CloudCoverSheet({ visible, locationId, onDismiss }: Props) {
  const { data: obs } = useWeatherObservations(locationId)
  const { data: hourly } = useHourlyForecast(locationId)
  const { width } = useWindowDimensions()
  const chartW = width - spacing.screenH * 2

  const cloudCoverPct = obs?.cloudCoverPct ?? 0

  const sunPattern =
    cloudCoverPct < 30
      ? 'Sustained exposure'
      : cloudCoverPct < 70
      ? 'Mixed exposure'
      : 'Limited direct sun'

  const directSunHrs = Math.round((1 - cloudCoverPct / 100) * 8)

  // Mock chart data with small variation around current value
  const chartData = Array.from({ length: 8 }, (_, i) =>
    Math.min(100, Math.max(0, cloudCoverPct + Math.sin(i * 0.8) * 10))
  )

  const hourlyCells = hourly.map((h) => ({
    time: h.time,
    rows: [`${cloudCoverPct}%`, cloudTag(cloudCoverPct)],
  }))

  return (
    <DetailSheet visible={visible} title="Cloud Cover" onDismiss={onDismiss}>
      <HeroRow
        left={{ value: obs ? `${cloudCoverPct}%` : '—', subLabel: 'Cloud Cover', definition: 'Sky fraction covered by cloud' }}
        right={{ value: skyCondition(cloudCoverPct), subLabel: 'Sky Condition', definition: 'Current sky description' }}
      />

      <SectionLabel text="Sky Coverage" />
      <RangeBar
        min={0}
        max={100}
        value={cloudCoverPct}
        gradientColors={[colors.good, colors.txt3, colors.txt4]}
        ticks={[
          { value: 20, label: 'Clear' },
          { value: 50, label: 'Partly' },
          { value: 90, label: 'Overcast' },
        ]}
      />

      <SectionLabel text="Details" />
      <InfoGrid
        cells={[
          { value: `${cloudCoverPct}%`, label: 'Sky covered' },
          { value: sunPattern, label: 'Sun pattern' },
          { value: 'Stable', label: 'Trend' },
          { value: `${directSunHrs} hrs estimated direct sun`, label: 'Sun exposure' },
        ]}
      />

      <SectionLabel text="Cloud Through the Day" />
      <SimpleLineChart
        data={chartData}
        width={chartW}
        height={80}
        color={colors.txt3}
        nowIndex={0}
      />

      <SectionLabel text="Hourly" />
      <HourlyDetailStrip cells={hourlyCells} />
    </DetailSheet>
  )
}
