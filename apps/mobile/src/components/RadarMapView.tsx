// Native fallback: static SVG map with precip blobs.
// Pan/zoom via react-native-maps is a future phase.
import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Defs, Ellipse, Pattern, Rect, Line as SvgLine } from 'react-native-svg'
import type { Location } from '@weatherteam6/types'
import type { RadarFrame } from '@weatherteam6/types'

type BlobKind = 'trace' | 'light' | 'mod' | 'heavy' | 'severe'
type BlobDef  = { kind: BlobKind; cx: number; cy: number; rx: number; ry: number }

const BLOBS: BlobDef[] = [
  { kind: 'light',  cx: 18, cy: 78, rx: 16, ry: 12 },
  { kind: 'mod',    cx: 34, cy: 64, rx: 20, ry: 15 },
  { kind: 'heavy',  cx: 46, cy: 56, rx: 12, ry: 11 },
  { kind: 'severe', cx: 58, cy: 48, rx:  8, ry:  8 },
  { kind: 'light',  cx: 72, cy: 40, rx: 17, ry: 13 },
  { kind: 'trace',  cx: 86, cy: 30, rx: 10, ry:  9 },
  { kind: 'trace',  cx: 26, cy: 90, rx:  9, ry:  7 },
]

const BLOB_COLOR: Record<BlobKind, string> = {
  trace:  'rgba(144,205,244,1)',
  light:  'rgba(99,179,237,1)',
  mod:    'rgba(63,131,248,1)',
  heavy:  'rgba(246,173,85,1)',
  severe: 'rgba(252,129,129,1)',
}
const OPACITIES: [number, number, number] = [0.18, 0.32, 0.52]

type Props = {
  frames: RadarFrame[]
  frameIndex: number
  tileUrlTemplate: string | null
  locations: Location[]
}

// frames, tileUrlTemplate, locations unused until native map is implemented (future phase).
export function RadarMapView({ frameIndex, frames: _frames, tileUrlTemplate: _tileUrlTemplate, locations: _locations }: Props) {
  const nowIndex   = 0
  const frameShift = (frameIndex - nowIndex) * 1.2

  return (
    <View style={styles.map}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <Pattern id="terrain" x="0" y="0" width="6.5" height="6.5"
            patternUnits="userSpaceOnUse" patternTransform="rotate(56)">
            <SvgLine x1="0" y1="0" x2="0" y2="6.5" stroke="rgba(226,232,240,0.05)" strokeWidth="0.25" />
          </Pattern>
          <Pattern id="grid" x="0" y="0" width="12.8" height="12.8" patternUnits="userSpaceOnUse">
            <SvgLine x1="0" y1="0" x2="12.8" y2="0" stroke="rgba(226,232,240,0.045)" strokeWidth="0.22" />
            <SvgLine x1="0" y1="0" x2="0" y2="12.8" stroke="rgba(226,232,240,0.045)" strokeWidth="0.22" />
          </Pattern>
        </Defs>
        <Rect width="100" height="100" fill="url(#terrain)" />
        <Rect width="100" height="100" fill="url(#grid)" />
        {BLOBS.map((b, i) => {
          const fill = BLOB_COLOR[b.kind]
          const cx = b.cx + frameShift * 0.7
          const cy = b.cy - frameShift * 0.45
          return (
            <React.Fragment key={i}>
              <Ellipse cx={cx} cy={cy} rx={b.rx}        ry={b.ry}        fill={fill} opacity={OPACITIES[0]} />
              <Ellipse cx={cx} cy={cy} rx={b.rx * 0.65} ry={b.ry * 0.65} fill={fill} opacity={OPACITIES[1]} />
              <Ellipse cx={cx} cy={cy} rx={b.rx * 0.35} ry={b.ry * 0.35} fill={fill} opacity={OPACITIES[2]} />
            </React.Fragment>
          )
        })}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#0d1117' },
})
