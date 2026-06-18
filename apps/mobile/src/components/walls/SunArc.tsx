import { View, Text, StyleSheet } from 'react-native'
import Svg, { Path, Line, Circle } from 'react-native-svg'
import { type as t, colors } from '@weatherteam6/design/tokens'

type Props = {
  winStart: number
  winEnd: number
  sunT: number
  sunriseFmt?: string
  sunsetFmt?: string
}

// Maps normalized time t (0–1) to a point on the half-dome arc.
// The arc goes from left (sunrise) to right (sunset) over the top.
function pt(t: number, cx: number, cy: number, r: number): [number, number] {
  const theta = Math.PI * (1 - t)
  return [cx + r * Math.cos(theta), cy - r * Math.sin(theta)]
}

export function SunArc({ winStart, winEnd, sunT, sunriseFmt = '—', sunsetFmt = '—' }: Props) {
  const cx = 48, cy = 48, r = 44

  const [bx0, by0] = pt(0, cx, cy, r)
  const [bx1, by1] = pt(1, cx, cy, r)
  const [wx0, wy0] = pt(winStart, cx, cy, r)
  const [wx1, wy1] = pt(winEnd, cx, cy, r)
  const [sx, sy] = pt(Math.max(0, Math.min(1, sunT)), cx, cy, r)

  const hasWindow = winEnd > winStart

  return (
    <View style={styles.container}>
      <Svg width={96} height={56} viewBox="0 0 96 56">
        {/* dotted full daylight arc */}
        <Path
          d={`M${bx0} ${by0} A${r} ${r} 0 0 1 ${bx1} ${by1}`}
          fill="none"
          stroke="rgba(226,232,240,0.16)"
          strokeWidth={2}
          strokeDasharray="2,3"
        />
        {/* direct-sun window arc (amber) */}
        {hasWindow && (
          <Path
            d={`M${wx0} ${wy0} A${r} ${r} 0 0 1 ${wx1} ${wy1}`}
            fill="none"
            stroke="rgba(253,186,116,0.85)"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        )}
        {/* horizon baseline */}
        <Line x1={4} y1={48} x2={92} y2={48} stroke="rgba(226,232,240,0.10)" strokeWidth={1} />
        {/* travelling sun dot */}
        <Circle cx={sx} cy={sy} r={10} fill="rgba(253,186,116,0.25)" />
        <Circle cx={sx} cy={sy} r={6} fill="rgba(253,186,116,1)" />
      </Svg>
      <View style={styles.ends}>
        <Text style={styles.endLabel}>{sunriseFmt}</Text>
        <Text style={styles.endLabel}>{sunsetFmt}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 96,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 1,
  },
  endLabel: {
    ...t.timeTick,
    color: colors.txt5,
  },
})
