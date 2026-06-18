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

export function TemperatureSheet({ visible, locationId, onDismiss }: Props) {
  const { data: obs } = useWeatherObservations(locationId)
  const { data: hourly } = useHourlyForecast(locationId)
  const { width } = useWindowDimensions()
  const chartW = width - spacing.screenH * 2

  const tempF = obs?.tempF ?? 0
  const feelsLikeF = obs?.feelsLikeF ?? 0
  const todayHighF = obs?.todayHighF ?? 0
  const todayLowF = obs?.todayLowF ?? 0

  const delta = feelsLikeF - tempF
  const deltaStr = `${delta > 0 ? '+' : ''}${delta}°`

  const comfortStr =
    tempF >= 55 && tempF <= 75
      ? 'Within 55–75°F'
      : tempF < 55
      ? 'Below 55–75°F'
      : 'Above 55–75°F'

  const chartData = hourly.length > 0 ? hourly.map((h) => h.tempF) : [tempF]

  const hourlyCells = hourly.map((h) => ({
    time: h.time,
    rows: [`${h.tempF}°F`, `feels like ${h.tempF - 3}°F`],
  }))

  return (
    <DetailSheet visible={visible} title="Temperature" onDismiss={onDismiss}>
      <HeroRow
        left={{ value: obs ? `${tempF}°F` : '—', subLabel: 'Air Temp', definition: 'Current air temperature at station' }}
        right={{ value: obs ? `${feelsLikeF}°F` : '—', subLabel: 'Feels Like', definition: 'Wind-chill or heat-index adjusted' }}
      />

      <SectionLabel text="Today's Range" />
      <RangeBar
        min={todayLowF}
        max={todayHighF || todayLowF + 1}
        value={tempF}
        gradientColors={[colors.rain, colors.good, colors.sun]}
        ticks={[
          { value: todayLowF, label: 'Low' },
          { value: 65, label: '65°' },
          { value: todayHighF, label: 'High' },
        ]}
      />

      <SectionLabel text="What This Means" />
      <InfoGrid
        cells={[
          { value: deltaStr, label: 'Wind-chill delta' },
          { value: obs ? `${todayHighF}°F` : '—', label: "Today's high" },
          { value: obs ? `${todayLowF}°F` : '—', label: "Tonight's low" },
          { value: comfortStr, label: 'Comfort range' },
        ]}
      />

      <SectionLabel text="24H Temperature" />
      <SimpleLineChart
        data={chartData}
        width={chartW}
        height={80}
        color={colors.sun}
        nowIndex={0}
      />

      <SectionLabel text="Hourly" />
      <HourlyDetailStrip cells={hourlyCells} />
    </DetailSheet>
  )
}
