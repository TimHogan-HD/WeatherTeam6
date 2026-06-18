import { useRef, useMemo, useState } from 'react'
import { View, Text, PanResponder, StyleSheet } from 'react-native'
import Svg, { Circle, Line, Polygon, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg'
import { colors, type as t } from '@weatherteam6/design/tokens'

type Props = {
  bearing: number // 0–359
  onChange: (deg: number) => void
}

const CARDINALS: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]

function pol(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function bearingToDir(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(deg / 22.5) % 16]!
}

function bearingToCaption(deg: number): string {
  const dir = bearingToDir(deg).toLowerCase()
  const map: Record<string, string> = {
    n: 'Faces north', nne: 'Faces north-northeast', ne: 'Faces northeast',
    ene: 'Faces east-northeast', e: 'Faces east', ese: 'Faces east-southeast',
    se: 'Faces southeast', sse: 'Faces south-southeast', s: 'Faces south',
    ssw: 'Faces south-southwest', sw: 'Faces southwest', wsw: 'Faces west-southwest',
    w: 'Faces west', wnw: 'Faces west-northwest', nw: 'Faces northwest',
    nnw: 'Faces north-northwest',
  }
  return map[dir] ?? `Faces ${deg}°`
}

const CX = 109, CY = 109, R = 92

export function CompassDial({ bearing, onChange }: Props) {
  const containerRef = useRef<View>(null)
  // Layout stored in state so useMemo can depend on it without accessing a ref during render
  const [layout, setLayout] = useState({ x: 0, y: 0, size: 218 })

  const panHandlers = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const scale = layout.size / 218
        const lx = (evt.nativeEvent.pageX - layout.x) / scale
        const ly = (evt.nativeEvent.pageY - layout.y) / scale
        onChange(Math.round(Math.atan2(lx - CX, CY - ly) * 180 / Math.PI + 360) % 360)
      },
      onPanResponderMove: (evt) => {
        const scale = layout.size / 218
        const lx = (evt.nativeEvent.pageX - layout.x) / scale
        const ly = (evt.nativeEvent.pageY - layout.y) / scale
        onChange(Math.round(Math.atan2(lx - CX, CY - ly) * 180 / Math.PI + 360) % 360)
      },
    }).panHandlers
  }, [onChange, layout])

  const ticks: React.ReactElement[] = []
  for (let i = 0; i < 24; i++) {
    const big = i % 6 === 0
    const [x1, y1] = pol(CX, CY, R, i * 15)
    const [x2, y2] = pol(CX, CY, R - (big ? 14 : 7), i * 15)
    ticks.push(
      <Line
        key={i} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={big ? 'rgba(226,232,240,0.4)' : 'rgba(226,232,240,0.16)'}
        strokeWidth={big ? 2 : 1}
      />
    )
  }

  const [tipX, tipY] = pol(CX, CY, R - 6, bearing)
  const [lX, lY] = pol(CX, CY, 22, bearing - 90)
  const [rX, rY] = pol(CX, CY, 22, bearing + 90)

  const dir = bearingToDir(bearing)
  const caption = bearingToCaption(bearing)

  return (
    <View
      ref={containerRef}
      style={styles.dialContainer}
      onLayout={(e) => {
        const { width } = e.nativeEvent.layout
        // containerRef.current accessed in event handler (not during render)
        containerRef.current?.measure((_fx, _fy, _w, _h, pageX, pageY) => {
          setLayout({ x: pageX, y: pageY, size: width })
        })
      }}
      {...panHandlers}
    >
      <Svg width="100%" height="100%" viewBox="0 0 218 218">
        <Defs>
          <LinearGradient id="wedge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="rgba(184,245,66,0.9)" />
            <Stop offset="100%" stopColor="rgba(184,245,66,0.12)" />
          </LinearGradient>
        </Defs>
        <Circle cx={CX} cy={CY} r={R} fill="rgba(255,255,255,0.03)" stroke="rgba(226,232,240,0.14)" strokeWidth={1.5} />
        <Circle cx={CX} cy={CY} r={R - 22} fill="none" stroke="rgba(226,232,240,0.07)" strokeWidth={1} />
        {ticks}
        <Polygon points={`${tipX},${tipY} ${lX},${lY} ${rX},${rY}`} fill="url(#wedge)" />
        {CARDINALS.map(([c, d]) => {
          const [x, y] = pol(CX, CY, R - 30, d)
          return (
            <SvgText
              key={c} x={x} y={y + 5}
              textAnchor="middle" fontSize={15} fontWeight="700"
              fill={c === 'N' ? 'rgba(252,129,129,0.9)' : 'rgba(226,232,240,0.55)'}
              fontFamily="BarlowCondensed"
            >
              {c}
            </SvgText>
          )
        })}
        <Circle cx={tipX} cy={tipY} r={13} fill="#b8f542" stroke="#0d1117" strokeWidth={4} />
      </Svg>
      <View style={styles.readout} pointerEvents="none">
        <Text style={styles.dirText}>{dir}</Text>
        <Text style={styles.degText}>{bearing}°</Text>
        <Text style={styles.capText}>{caption}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  dialContainer: {
    width: 218,
    height: 218,
    alignSelf: 'center',
    marginTop: 26,
    position: 'relative',
  },
  readout: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirText: {
    fontFamily: 'BarlowCondensed',
    fontSize: 46,
    fontWeight: '700',
    color: colors.txt1,
    lineHeight: 46,
  },
  degText: {
    ...t.label,
    color: colors.txt3,
    marginTop: 4,
  },
  capText: {
    fontFamily: 'Barlow',
    fontSize: 10,
    color: colors.txt4,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
})
