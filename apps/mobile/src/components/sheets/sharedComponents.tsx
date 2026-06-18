import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, {
  Path,
  Line,
  Rect,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg'
import { colors, fonts, spacing, type as t } from '@weatherteam6/design/tokens'

// ─── HeroRow ──────────────────────────────────────────────────────────────────

type HeroCellProps = {
  value: string
  subLabel: string
  definition: string
}

function HeroCell({ value, subLabel, definition }: HeroCellProps) {
  return (
    <View style={heroStyles.cell}>
      <Text style={heroStyles.value}>{value}</Text>
      <Text style={heroStyles.subLabel}>{subLabel}</Text>
      <Text style={heroStyles.definition}>{definition}</Text>
    </View>
  )
}

export type HeroRowData = { value: string; subLabel: string; definition: string }

type HeroRowProps = { left: HeroRowData; right: HeroRowData }

export function HeroRow({ left, right }: HeroRowProps) {
  return (
    <View style={heroStyles.row}>
      <HeroCell {...left} />
      <View style={heroStyles.divider} />
      <HeroCell {...right} />
    </View>
  )
}

const heroStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: spacing.sectionTop,
  },
  cell: {
    flex: 1,
    alignItems: 'flex-start',
    paddingVertical: spacing.tight,
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 36,
    fontWeight: '700',
    color: colors.txt1,
    lineHeight: 38,
  },
  subLabel: {
    ...t.bodySm,
    marginTop: spacing.micro,
  },
  definition: {
    ...t.bodySm,
    color: colors.txt4,
    marginTop: spacing.micro,
  },
  divider: {
    width: 1,
    backgroundColor: colors.line,
    marginHorizontal: spacing.cardPadSm,
    marginVertical: spacing.tight,
  },
})

// ─── RangeBar ─────────────────────────────────────────────────────────────────

type Tick = { value: number; label: string }

type RangeBarProps = {
  min: number
  max: number
  value: number
  gradientColors: string[]
  ticks: Tick[]
  width?: number
}

export function RangeBar({ min, max, value, gradientColors, ticks, width = 280 }: RangeBarProps) {
  const W = width
  const H = 12
  const needlePct = Math.min(1, Math.max(0, (value - min) / (max - min)))
  const needleX = needlePct * W

  return (
    <View style={rangeStyles.container}>
      <Svg width={W} height={H + 24} viewBox={`0 0 ${W} ${H + 24}`}>
        <Defs>
          <SvgLinearGradient id="rangeGrad" x1="0" y1="0" x2="1" y2="0">
            {gradientColors.map((c, i) => (
              <Stop
                key={i}
                offset={`${(i / (gradientColors.length - 1)) * 100}%`}
                stopColor={c}
                stopOpacity="1"
              />
            ))}
          </SvgLinearGradient>
        </Defs>
        {/* Track */}
        <Rect x={0} y={0} width={W} height={H} rx={H / 2} fill="url(#rangeGrad)" />
        {/* Needle */}
        <Rect x={needleX - 1.5} y={-2} width={3} height={H + 4} rx={1.5} fill={colors.txt1} />
        {/* Tick labels */}
        {ticks.map((tick) => {
          const tx = Math.min(W - 20, Math.max(0, ((tick.value - min) / (max - min)) * W))
          return (
            <SvgText
              key={tick.label}
              x={tx}
              y={H + 16}
              fontSize={9}
              fontFamily={fonts.display}
              fill={colors.txt4}
              textAnchor="middle"
            >
              {tick.label}
            </SvgText>
          )
        })}
      </Svg>
    </View>
  )
}

const rangeStyles = StyleSheet.create({
  container: {
    marginVertical: spacing.sectionTop,
    alignItems: 'flex-start',
  },
})

// ─── InfoGrid ─────────────────────────────────────────────────────────────────

type InfoCell = { value: string; label: string }

type InfoGridProps = { cells: [InfoCell, InfoCell, InfoCell, InfoCell] }

export function InfoGrid({ cells }: InfoGridProps) {
  return (
    <View style={gridStyles.container}>
      <View style={gridStyles.row}>
        <View style={gridStyles.cell}>
          <Text style={gridStyles.value}>{cells[0].value}</Text>
          <Text style={gridStyles.label}>{cells[0].label}</Text>
        </View>
        <View style={gridStyles.cell}>
          <Text style={gridStyles.value}>{cells[1].value}</Text>
          <Text style={gridStyles.label}>{cells[1].label}</Text>
        </View>
      </View>
      <View style={gridStyles.row}>
        <View style={gridStyles.cell}>
          <Text style={gridStyles.value}>{cells[2].value}</Text>
          <Text style={gridStyles.label}>{cells[2].label}</Text>
        </View>
        <View style={gridStyles.cell}>
          <Text style={gridStyles.value}>{cells[3].value}</Text>
          <Text style={gridStyles.label}>{cells[3].label}</Text>
        </View>
      </View>
    </View>
  )
}

const gridStyles = StyleSheet.create({
  container: {
    gap: spacing.listGapSm,
    marginBottom: spacing.sectionTop,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.listGapSm,
  },
  cell: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: spacing.listGap,
    padding: spacing.cellPad,
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '700',
    color: colors.txt1,
  },
  label: {
    ...t.labelSm,
    color: colors.txt4,
    marginTop: spacing.micro,
  },
})

// ─── SimpleLineChart ──────────────────────────────────────────────────────────

type SimpleLineChartProps = {
  data: number[]
  width: number
  height: number
  color: string
  nowIndex?: number
}

export function SimpleLineChart({ data, width, height, color, nowIndex }: SimpleLineChartProps) {
  if (data.length < 2) {
    return <View style={{ width, height }} />
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 4

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - pad * 2) + pad
    const y = pad + ((1 - (v - min) / range) * (height - pad * 2))
    return `${x},${y}`
  })

  const pathD = `M ${pts.join(' L ')}`

  const nowX = nowIndex !== undefined
    ? (nowIndex / (data.length - 1)) * (width - pad * 2) + pad
    : null

  return (
    <Svg width={width} height={height}>
      {nowX !== null ? (
        <Line
          x1={nowX}
          y1={pad}
          x2={nowX}
          y2={height - pad}
          stroke={colors.line2}
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      ) : null}
      <Path d={pathD} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  )
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

export function SectionLabel({ text }: { text: string }) {
  return <Text style={sectionLabelStyles.text}>{text}</Text>
}

const sectionLabelStyles = StyleSheet.create({
  text: {
    ...t.label,
    marginBottom: spacing.listGap,
    marginTop: spacing.tight,
  },
})

// ─── HourlyDetailStrip ────────────────────────────────────────────────────────

type HourlyCell = { time: string; rows: string[] }

type HourlyDetailStripProps = { cells: HourlyCell[] }

export function HourlyDetailStrip({ cells }: HourlyDetailStripProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={hourlyStyles.strip}>
      {cells.map((cell, i) => (
        <View key={i} style={hourlyStyles.cell}>
          <Text style={hourlyStyles.time}>{cell.time}</Text>
          {cell.rows.map((row, j) => (
            <Text key={j} style={j === 0 ? hourlyStyles.primary : hourlyStyles.secondary}>
              {row}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  )
}

const hourlyStyles = StyleSheet.create({
  strip: {
    marginBottom: spacing.sectionTop,
  },
  cell: {
    alignItems: 'center',
    marginRight: spacing.sectionGap,
    minWidth: 48,
  },
  time: {
    ...t.timeTick,
    marginBottom: spacing.tight,
  },
  primary: {
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '700',
    color: colors.txt1,
    textAlign: 'center',
  },
  secondary: {
    ...t.bodySm,
    textAlign: 'center',
    marginTop: spacing.micro,
  },
})
