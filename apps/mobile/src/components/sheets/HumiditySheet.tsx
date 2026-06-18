import { useWindowDimensions } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors, spacing } from '@weatherteam6/design/tokens'
import { useWeatherObservations } from '../../hooks/useWeatherObservations'
import { useHourlyForecast } from '../../hooks/useHourlyForecast'
import { DetailSheet } from './DetailSheet'
import {
  HeroRow,
  RangeBar,
  InfoGrid,
  SectionLabel,
  HourlyDetailStrip,
} from './sharedComponents'

type Props = {
  visible: boolean
  locationId: string
  onDismiss: () => void
}

function buildLinePath(data: number[], width: number, height: number): string {
  if (data.length < 2) return ''
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 4
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - pad * 2) + pad
    const y = pad + ((1 - (v - min) / range) * (height - pad * 2))
    return `${x},${y}`
  })
  return `M ${pts.join(' L ')}`
}

export function HumiditySheet({ visible, locationId, onDismiss }: Props) {
  const { data: obs } = useWeatherObservations(locationId)
  const { data: hourly } = useHourlyForecast(locationId)
  const { width } = useWindowDimensions()
  const chartW = width - spacing.screenH * 2
  const chartH = 80

  const humidity = obs?.humidityPct ?? 50
  const dewPoint = obs?.dewPointF ?? 50
  const tempF = obs?.tempF ?? 70

  // Mock 8-point series with small variations
  const rhData = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    Math.min(100, Math.max(0, humidity + Math.sin(i) * 5))
  )
  const dpData = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    dewPoint + Math.sin(i + 1) * 2
  )

  const rhPath = buildLinePath(rhData, chartW, chartH)
  const dpPath = buildLinePath(dpData, chartW, chartH)

  const feelsLike =
    humidity > 70 ? 'Muggy' : humidity > 50 ? 'Comfortable' : 'Dry'
  const dpComfort =
    dewPoint < 50 ? 'Dry' : dewPoint < 60 ? 'Comfortable' : dewPoint < 70 ? 'Humid' : 'Oppressive'
  const spread = tempF - dewPoint
  const fogRisk = spread < 10 ? 'Fog risk' : 'Low fog risk'
  const rhProjection =
    humidity >= 80 ? 'Already at 80%+' : 'Trend: stable'

  const hourlyCells = hourly.map((h) => ({
    time: h.time,
    rows: [`${humidity}%`, `dew ${dewPoint}°F`],
  }))

  return (
    <DetailSheet visible={visible} title="Humidity" onDismiss={onDismiss}>
      <HeroRow
        left={{ value: obs ? `${humidity}%` : '—', subLabel: 'Relative Humidity', definition: 'Moisture content of air' }}
        right={{ value: obs ? `${dewPoint}°F` : '—', subLabel: 'Dew Point', definition: 'Temperature at which air saturates' }}
      />

      <SectionLabel text="Dew Point Comfort" />
      <RangeBar
        min={20}
        max={80}
        value={dewPoint}
        gradientColors={[colors.sun, colors.good, colors.rain, colors.poor]}
        ticks={[
          { value: 35, label: 'Dry' },
          { value: 55, label: 'Comfortable' },
          { value: 65, label: 'Humid' },
          { value: 75, label: 'Oppressive' },
        ]}
      />

      <SectionLabel text="24H RH & Dew Point" />
      {rhPath.length > 0 ? (
        <Svg width={chartW} height={chartH}>
          <Path d={rhPath} stroke={colors.rain} strokeWidth={2} fill="none" />
          <Path d={dpPath} stroke={colors.sun} strokeWidth={2} strokeDasharray="4,3" fill="none" />
        </Svg>
      ) : null}

      <SectionLabel text="Details" />
      <InfoGrid
        cells={[
          { value: feelsLike, label: 'Moisture comfort' },
          { value: dpComfort, label: 'Comfort level' },
          { value: `${spread.toFixed(0)}°F spread`, label: fogRisk },
          { value: rhProjection, label: 'RH projection' },
        ]}
      />

      <SectionLabel text="Hourly" />
      <HourlyDetailStrip cells={hourlyCells} />
    </DetailSheet>
  )
}
