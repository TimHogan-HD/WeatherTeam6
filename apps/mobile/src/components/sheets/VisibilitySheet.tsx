import { colors } from '@weatherteam6/design/tokens'
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

function visibilityCondition(miles: number): string {
  if (miles >= 10) return 'Clear'
  if (miles >= 5) return 'Good'
  if (miles >= 2) return 'Reduced'
  return 'Poor'
}


export function VisibilitySheet({ visible, locationId, onDismiss }: Props) {
  const { data: obs } = useWeatherObservations(locationId)
  const { data: hourly } = useHourlyForecast(locationId)

  const visMiles = obs?.visibilityMiles ?? 10
  const tempF = obs?.tempF ?? 70
  const dewPoint = obs?.dewPointF ?? 50

  const spread = tempF - dewPoint
  const fogRisk =
    spread < 5 ? 'High' : spread < 15 ? 'Moderate' : 'Low'

  const hourlyCells = hourly.map((h) => ({
    time: h.time,
    rows: [`${visMiles} mi`, visibilityCondition(visMiles)],
  }))

  return (
    <DetailSheet visible={visible} title="Visibility" onDismiss={onDismiss}>
      <HeroRow
        left={{ value: obs ? `${visMiles} mi` : '—', subLabel: 'Visibility', definition: 'Horizontal visibility at station' }}
        right={{ value: visibilityCondition(visMiles), subLabel: 'Condition', definition: 'Current classification' }}
      />

      <SectionLabel text="Visibility Scale" />
      <RangeBar
        min={0}
        max={10}
        value={visMiles}
        gradientColors={[colors.poor, colors.fair, colors.good]}
        ticks={[
          { value: 0.25, label: 'Fog' },
          { value: 2, label: 'Rain/Haze' },
          { value: 6, label: 'Haze' },
          { value: 10, label: 'Clear' },
        ]}
      />

      <SectionLabel text="Details" />
      <InfoGrid
        cells={[
          { value: `${fogRisk} fog risk`, label: 'Fog risk' },
          { value: 'No active reports', label: 'Haze/smoke' },
          { value: `${visMiles} mi expected`, label: 'Tonight' },
          { value: obs ? `${visMiles} mi` : '—', label: 'Now' },
        ]}
      />

      <SectionLabel text="Hourly" />
      <HourlyDetailStrip cells={hourlyCells} />
    </DetailSheet>
  )
}
