import { useWindowDimensions } from 'react-native'
import { colors, spacing } from '@weatherteam6/design/tokens'
import { useWeatherObservations } from '../../hooks/useWeatherObservations'
import { DetailSheet } from './DetailSheet'
import {
  HeroRow,
  RangeBar,
  InfoGrid,
  SimpleLineChart,
  SectionLabel,
} from './sharedComponents'

type Props = {
  visible: boolean
  locationId: string
  onDismiss: () => void
}

function trendArrow(trend: 'rising' | 'falling' | 'steady'): string {
  if (trend === 'rising') return '↑ Rising'
  if (trend === 'falling') return '↓ Falling'
  return '→ Steady'
}

export function PressureSheet({ visible, locationId, onDismiss }: Props) {
  const { data: obs } = useWeatherObservations(locationId)
  const { width } = useWindowDimensions()
  const chartW = width - spacing.screenH * 2

  const pressure = obs?.pressureInHg ?? 29.92
  const trend = obs?.pressureTrend ?? 'steady'

  const stormSignal =
    pressure < 29.5 && trend === 'falling' ? 'Falling rapidly' : 'No storm signal'

  // Mock flat data at current pressure
  const chartData = Array.from({ length: 8 }, () => pressure)

  return (
    <DetailSheet visible={visible} title="Pressure" onDismiss={onDismiss}>
      <HeroRow
        left={{ value: obs ? `${pressure.toFixed(2)} inHg` : '—', subLabel: 'Barometric Pressure', definition: 'Sea-level pressure' }}
        right={{ value: trendArrow(trend), subLabel: 'Trend', definition: 'Change over last 3 hours' }}
      />

      <SectionLabel text="Normal Range" />
      <RangeBar
        min={28.5}
        max={31.0}
        value={pressure}
        gradientColors={[colors.poor, colors.fair, colors.good, colors.good]}
        ticks={[
          { value: 29.0, label: 'Storm Low' },
          { value: 29.92, label: 'Normal' },
          { value: 30.5, label: 'Clear High' },
        ]}
      />

      <SectionLabel text="Details" />
      <InfoGrid
        cells={[
          { value: trend.charAt(0).toUpperCase() + trend.slice(1), label: 'Trend' },
          { value: '≈ 0.01 inHg/hr', label: 'Change/hour' },
          { value: stormSignal, label: 'Until storm' },
          { value: obs ? `${pressure.toFixed(2)} inHg` : '—', label: 'Right now' },
        ]}
      />

      <SectionLabel text="24H Pressure" />
      <SimpleLineChart
        data={chartData}
        width={chartW}
        height={80}
        color={colors.good}
        nowIndex={0}
      />
    </DetailSheet>
  )
}
