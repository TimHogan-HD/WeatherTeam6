import { View, Text, Pressable, StyleSheet } from 'react-native'
import Svg, { Path, Circle, Text as SvgText } from 'react-native-svg'
import { colors, type as t, spacing, radius } from '@weatherteam6/design/tokens'

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
type Dir = typeof DIRS[number]

const DIR_DEGREES: Record<Dir, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315,
}

const PRESETS: { label: string; dir: Dir }[] = [
  { label: 'AM sun', dir: 'SE' },
  { label: 'PM sun', dir: 'SW' },
  { label: 'Shade', dir: 'N' },
]

type Props = {
  active: Dir
  onChange: (dir: Dir, deg: number) => void
}

function pol(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function donutSlice(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number): string {
  const [x0o, y0o] = pol(cx, cy, rO, a0)
  const [x1o, y1o] = pol(cx, cy, rO, a1)
  const [x1i, y1i] = pol(cx, cy, rI, a1)
  const [x0i, y0i] = pol(cx, cy, rI, a0)
  const large = (a1 - a0) % 360 > 180 ? 1 : 0
  return `M${x0o} ${y0o} A${rO} ${rO} 0 ${large} 1 ${x1o} ${y1o} L${x1i} ${y1i} A${rI} ${rI} 0 ${large} 0 ${x0i} ${y0i} Z`
}

export function CompassRose({ active, onChange }: Props) {
  const cx = 110, cy = 110, rO = 100, rI = 44, gap = 3

  return (
    <View style={styles.container}>
      <View style={styles.roseWrapper}>
        <Svg width={220} height={220} viewBox="0 0 220 220">
          {DIRS.map((d, i) => {
            const c = i * 45
            const on = d === active
            return (
              <Path
                key={d}
                d={donutSlice(cx, cy, rO, rI, c - 45 / 2 + gap, c + 45 / 2 - gap)}
                fill={on ? '#b8f542' : 'rgba(255,255,255,0.05)'}
                stroke={on ? 'none' : 'rgba(226,232,240,0.12)'}
                strokeWidth={1}
                onPress={() => onChange(d, DIR_DEGREES[d])}
              />
            )
          })}
          {DIRS.map((d, i) => {
            const c = i * 45
            const on = d === active
            const [lx, ly] = pol(cx, cy, (rO + rI) / 2, c)
            return (
              <SvgText
                key={`lbl-${d}`}
                x={lx} y={ly + 5}
                textAnchor="middle"
                fontSize={14}
                fontWeight="700"
                fontFamily="BarlowCondensed"
                fill={on ? '#0d1117' : (d === 'N' ? 'rgba(252,129,129,0.85)' : 'rgba(226,232,240,0.6)')}
              >
                {d}
              </SvgText>
            )
          })}
          <Circle cx={cx} cy={cy} r={rI - 4} fill="rgba(13,17,23,0.6)" stroke="rgba(226,232,240,0.1)" strokeWidth={1} />
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.dir}>{active}</Text>
          <Text style={styles.deg}>{DIR_DEGREES[active]}°</Text>
        </View>
      </View>

      <View style={styles.presets}>
        {PRESETS.map(p => (
          <Pressable
            key={p.label}
            style={[styles.preset, active === p.dir && styles.presetActive]}
            onPress={() => onChange(p.dir, DIR_DEGREES[p.dir])}
          >
            <Text style={[styles.presetLabel, active === p.dir && styles.presetLabelActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 26,
  },
  roseWrapper: {
    width: 220,
    height: 220,
    position: 'relative',
  },
  center: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dir: {
    fontFamily: 'BarlowCondensed',
    fontSize: 34,
    fontWeight: '700',
    color: colors.txt1,
    lineHeight: 34,
  },
  deg: {
    ...t.label,
    color: colors.txt4,
    marginTop: 3,
  },
  presets: {
    flexDirection: 'row',
    gap: spacing.chipGap,
    marginTop: 22,
  },
  preset: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radius.chipMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  presetActive: {
    backgroundColor: colors.goodTint,
    borderColor: colors.goodTintBorder,
  },
  presetLabel: {
    fontFamily: 'BarlowCondensed',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.txt2,
  },
  presetLabelActive: {
    color: colors.good,
  },
})
