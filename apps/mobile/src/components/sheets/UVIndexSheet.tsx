import { useWindowDimensions } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { colors, spacing } from '@weatherteam6/design/tokens'
import { useWeatherObservations } from '../../hooks/useWeatherObservations'
import { DetailSheet } from './DetailSheet'
import {
  HeroRow,
  InfoGrid,
  SimpleLineChart,
  SectionLabel,
} from './sharedComponents'

type Props = {
  visible: boolean
  locationId: string
  onDismiss: () => void
}

function uvRiskLevel(uv: number): string {
  if (uv <= 2) return 'Low'
  if (uv <= 5) return 'Moderate'
  if (uv <= 7) return 'High'
  if (uv <= 10) return 'Very High'
  return 'Extreme'
}

// UV scale: 11 segments from green to purple
const UV_SEGMENT_COLORS = [
  '#4ade80', // 0-1 green
  '#86efac',
  '#fde047', // 3 yellow
  '#fbbf24',
  '#fb923c',
  '#f97316', // 5-6 orange
  '#ef4444',
  '#dc2626', // 7-8 red
  '#b91c1c',
  '#7c3aed', // 9-10 purple
  '#6d28d9',
]

function UVScaleBar({ uvIndex, width }: { uvIndex: number; width: number }) {
  const segW = width / 11
  const needlePct = Math.min(1, Math.max(0, uvIndex / 11))
  const needleX = needlePct * width

  return (
    <Svg width={width} height={24} viewBox={`0 0 ${width} 24`}>
      {UV_SEGMENT_COLORS.map((c, i) => (
        <Rect
          key={i}
          x={i * segW}
          y={0}
          width={segW - 1}
          height={12}
          rx={i === 0 ? 6 : i === 10 ? 6 : 0}
          fill={c}
        />
      ))}
      {/* Needle */}
      <Rect x={needleX - 1.5} y={-2} width={3} height={16} rx={1.5} fill={colors.txt1} />
    </Svg>
  )
}

export function UVIndexSheet({ visible, locationId, onDismiss }: Props) {
  const { data: obs } = useWeatherObservations(locationId)
  const { width } = useWindowDimensions()
  const chartW = width - spacing.screenH * 2

  const uvIndex = obs?.uvIndex ?? 0
  const cloudCoverPct = obs?.cloudCoverPct ?? 0

  const riskLevel = uvRiskLevel(uvIndex)

  // Bell curve mock data (peak at hour 5 of 12)
  const bellData = Array.from({ length: 12 }, (_, i) => {
    const x = (i - 5) / 3
    return Math.max(0, uvIndex * Math.exp(-0.5 * x * x))
  })

  const uvBelowThree =
    uvIndex <= 3
      ? 'Currently at or below 3'
      : `After approximately ${Math.round(14 + (11 - uvIndex))}:00`

  return (
    <DetailSheet visible={visible} title="UV Index" onDismiss={onDismiss}>
      <HeroRow
        left={{ value: obs ? `${uvIndex}` : '—', subLabel: 'UV Index', definition: 'WHO standard, clear-sky estimate' }}
        right={{ value: riskLevel, subLabel: 'Risk Level', definition: 'Current risk category' }}
      />

      <SectionLabel text="UV Scale" />
      <UVScaleBar uvIndex={uvIndex} width={chartW} />

      <SectionLabel text="Details" />
      <InfoGrid
        cells={[
          { value: riskLevel, label: 'Current risk' },
          { value: 'Around noon', label: "Today's peak" },
          { value: `${cloudCoverPct}% coverage reducing UV ~${Math.round(cloudCoverPct * 0.7)}%`, label: 'Cloud cover' },
          { value: uvBelowThree, label: 'UV below 3' },
        ]}
      />

      <SectionLabel text="UV Through the Day" />
      <SimpleLineChart
        data={bellData}
        width={chartW}
        height={80}
        color={colors.sun}
        nowIndex={0}
      />
    </DetailSheet>
  )
}
