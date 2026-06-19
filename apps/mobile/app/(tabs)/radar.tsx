import React, { useRef, useEffect, useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Ellipse,
  Pattern,
  Rect,
  Line as SvgLine,
} from 'react-native-svg'
import {
  IconDroplet,
  IconTemperature,
  IconWind,
  IconCloud,
  IconBolt,
  IconPlayerPlay,
  IconPlayerPause,
} from '@tabler/icons-react-native'
import { colors, spacing, radius, fonts } from '@weatherteam6/design/tokens'
import { TopBar } from '../../src/components/TopBar'
import { useRadarFrames } from '../../src/hooks/useRadarFrames'
import { useLocations } from '../../src/hooks/useLocations'

// ─── Types ───────────────────────────────────────────────────────────────────

type BlobKind = 'trace' | 'light' | 'mod' | 'heavy' | 'severe'
type LayerId  = 'Precip' | 'Temp' | 'Wind' | 'Cloud' | 'Ltng'

type BlobDef = {
  kind: BlobKind
  cx: number   // SVG viewBox 0–100 coordinate space
  cy: number
  rx: number
  ry: number
}

type ScrubLayout = { x: number; width: number }

// ─── Static data ─────────────────────────────────────────────────────────────

const LAYERS: Array<{ id: LayerId; Icon: React.ComponentType<{ size: number; color: string }> }> = [
  { id: 'Precip', Icon: IconDroplet },
  { id: 'Temp',   Icon: IconTemperature },
  { id: 'Wind',   Icon: IconWind },
  { id: 'Cloud',  Icon: IconCloud },
  { id: 'Ltng',   Icon: IconBolt },
]

// Blob positions from the mockup's BlobField, converted to SVG 0–100 space.
// cx/cy = centre (CSS x%/y% already maps to 0–100); rx/ry scaled from px.
const STATIC_BLOBS: BlobDef[] = [
  { kind: 'light',  cx: 18, cy: 78, rx: 16, ry: 12 },
  { kind: 'mod',    cx: 34, cy: 64, rx: 20, ry: 15 },
  { kind: 'heavy',  cx: 46, cy: 56, rx: 12, ry: 11 },
  { kind: 'severe', cx: 58, cy: 48, rx:  8, ry:  8 },
  { kind: 'light',  cx: 72, cy: 40, rx: 17, ry: 13 },
  { kind: 'trace',  cx: 86, cy: 30, rx: 10, ry:  9 },
  { kind: 'trace',  cx: 26, cy: 90, rx:  9, ry:  7 },
]

// Inner/outer gradient stops per intensity level
const BLOB_GRADIENT: Record<BlobKind, [string, string]> = {
  trace:  ['rgba(144,205,244,0.40)', 'rgba(144,205,244,0.08)'],
  light:  ['rgba(99,179,237,0.60)',  'rgba(99,179,237,0.12)'],
  mod:    ['rgba(63,131,248,0.78)',  'rgba(99,179,237,0.20)'],
  heavy:  ['rgba(246,173,85,0.82)',  'rgba(63,131,248,0.28)'],
  severe: ['rgba(252,129,129,0.92)', 'rgba(246,173,85,0.40)'],
}

// ─── BlobField ───────────────────────────────────────────────────────────────
// SVG covering the map canvas: terrain contour lines, grid, precip echoes.
// frameShift moves blobs NE to simulate radar loop motion.

function BlobField({ frameShift }: { frameShift: number }) {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      <Defs>
        <Pattern
          id="terrain"
          x="0" y="0"
          width="6.5" height="6.5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(56)"
        >
          <SvgLine x1="0" y1="0" x2="0" y2="6.5" stroke="rgba(226,232,240,0.05)" strokeWidth="0.25" />
        </Pattern>
        <Pattern
          id="grid"
          x="0" y="0"
          width="12.8" height="12.8"
          patternUnits="userSpaceOnUse"
        >
          <SvgLine x1="0" y1="0" x2="12.8" y2="0" stroke="rgba(226,232,240,0.045)" strokeWidth="0.22" />
          <SvgLine x1="0" y1="0" x2="0" y2="12.8" stroke="rgba(226,232,240,0.045)" strokeWidth="0.22" />
        </Pattern>
        {STATIC_BLOBS.map((blob, i) => {
          const [inner, outer] = BLOB_GRADIENT[blob.kind]
          return (
            <RadialGradient key={i} id={`bg${i}`} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
              <Stop offset="0%"   stopColor={inner} />
              <Stop offset="60%"  stopColor={outer} />
              <Stop offset="100%" stopColor="transparent" />
            </RadialGradient>
          )
        })}
      </Defs>
      <Rect width="100" height="100" fill="url(#terrain)" />
      <Rect width="100" height="100" fill="url(#grid)" />
      {STATIC_BLOBS.map((blob, i) => (
        <Ellipse
          key={i}
          cx={blob.cx + frameShift * 0.7}
          cy={blob.cy - frameShift * 0.45}
          rx={blob.rx}
          ry={blob.ry}
          fill={`url(#bg${i})`}
        />
      ))}
    </Svg>
  )
}

// ─── HereMarker ──────────────────────────────────────────────────────────────
// Uses useState lazy init for Animated.Value — avoids ref access during render.

function HereMarker() {
  const [scale]   = useState(() => new Animated.Value(0.5))
  const [opacity] = useState(() => new Animated.Value(0.9))

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(scale,   { toValue: 1.6, duration: 2600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 2600, useNativeDriver: true }),
      ])
    ).start()
  }, [scale, opacity])

  return (
    <View style={styles.here}>
      <Animated.View style={[styles.hereRing, { transform: [{ scale }], opacity }]} />
      <View style={styles.hereCore} />
    </View>
  )
}

// ─── CragPin ─────────────────────────────────────────────────────────────────

type PinTone = 'good' | 'fair' | undefined

function CragPin({
  left,
  top,
  label,
  tone,
}: {
  left: `${number}%`
  top: `${number}%`
  label?: string
  tone?: PinTone
}) {
  return (
    <View style={[styles.pin, { left, top }]} pointerEvents="none">
      <View
        style={[
          styles.pinDot,
          tone === 'good' ? styles.pinGood
            : tone === 'fair' ? styles.pinFair
            : styles.pinNeutral,
        ]}
      />
      {label ? <Text style={styles.pinChip}>{label}</Text> : null}
    </View>
  )
}

// ─── RadarScreen ─────────────────────────────────────────────────────────────

export default function RadarScreen() {
  const [activeLayer, setActiveLayer] = useState<LayerId>('Precip')
  const [frameIndex, setFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying]   = useState(false)

  // Scrubber track layout stored in state so useMemo can capture it without
  // ref access during render (same pattern as CompassDial).
  const [scrubLayout, setScrubLayout] = useState<ScrubLayout>({ x: 0, width: 260 })

  // Stable mount time — avoids calling Date.now() / new Date() in render body.
  const [mountMs]   = useState(() => Date.now())
  const [mountDate] = useState(() => new Date())

  const { data: framesData } = useRadarFrames()
  useLocations()  // pre-warms location cache; crag pins use static layout in Phase 12

  const pastFrames    = framesData?.past    ?? []
  const nowcastFrames = framesData?.nowcast ?? []
  const allFrames     = [...pastFrames, ...nowcastFrames]
  const nowIndex      = Math.max(0, pastFrames.length - 1)
  const totalFrames   = allFrames.length || 12

  // Play loop
  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % totalFrames)
    }, 600)
    return () => clearInterval(id)
  }, [isPlaying, totalFrames])

  // Current frame time label
  const currentFrame = allFrames[frameIndex]
  const frameDateMs  = currentFrame ? currentFrame.time * 1000 : mountMs
  const frameLabel   = new Date(frameDateMs).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  const isAtNow = allFrames.length > 0 ? frameIndex === nowIndex : true

  // Blob shift (NE direction) to simulate radar motion across the loop
  const frameShift = (frameIndex - nowIndex) * 1.2

  // Scrubber fractions
  const handleFraction = totalFrames > 1 ? frameIndex / (totalFrames - 1) : 0
  const nowFraction    = totalFrames > 1 ? nowIndex  / (totalFrames - 1) : 0.5

  // Pixel positions for scrubber track elements (computed from measured width)
  const pastWidthPx  = nowFraction    * scrubLayout.width
  const nowLeftPx    = nowFraction    * scrubLayout.width - 1
  const handleLeftPx = handleFraction * scrubLayout.width - 7

  // PanResponder — captures totalFrames and scrubLayout via useMemo closure.
  // Re-created only when those values change, so the handler always has fresh values.
  const panHandlers = useMemo(() => {
    const tw = scrubLayout.width
    const tx = scrubLayout.x
    const n  = totalFrames
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (_, gs) => {
        setIsPlaying(false)
        if (tw <= 0) return
        const fraction = Math.max(0, Math.min(1, (gs.x0 - tx) / tw))
        setFrameIndex(Math.round(fraction * Math.max(0, n - 1)))
      },
      onPanResponderMove: (_, gs) => {
        if (tw <= 0) return
        const fraction = Math.max(0, Math.min(1, (gs.moveX - tx) / tw))
        setFrameIndex(Math.round(fraction * Math.max(0, n - 1)))
      },
    }).panHandlers
  }, [totalFrames, scrubLayout])

  const trackViewRef = useRef<View>(null)

  const dayStr = mountDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Top bar */}
        <TopBar
          title="Radar"
          rightElement={
            <Text style={styles.topTime}>{dayStr} {frameLabel}</Text>
          }
        />

        {/* Layer toggle chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.layerRow}
          contentContainerStyle={styles.layerRowContent}
        >
          {LAYERS.map(({ id, Icon }) => {
            const active = activeLayer === id
            return (
              <Pressable
                key={id}
                onPress={() => setActiveLayer(id)}
                style={[styles.layerChip, active && styles.layerChipActive]}
              >
                <Icon size={14} color={active ? colors.good : colors.txt3} />
                <Text style={[styles.layerChipText, active && styles.layerChipTextActive]}>
                  {id}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* ── Full-bleed radar map ─────────────────────────────── */}
        <View style={styles.map}>
          <View style={[StyleSheet.absoluteFill, styles.mapBase]} />

          {/* Terrain texture + grid + precip echoes */}
          <BlobField frameShift={frameShift} />

          {/* Crag pins — static layout for Phase 12; real projection in Phase 13 */}
          <CragPin left="58%" top="48%" label="Taylors Falls" tone="fair" />
          <CragPin left="74%" top="73%" label="Sandstone"     tone="good" />
          <CragPin left="22%" top="42%" label="Interstate" />

          {/* You are here — pulsing ring centred at 40%, 62% */}
          <View style={styles.hereWrap} pointerEvents="none">
            <HereMarker />
          </View>

          {/* Storm cell callout */}
          <View style={styles.callout}>
            <Text style={styles.calloutLabel}>Cell · approaching</Text>
            <Text style={styles.calloutText}>18 mph NE · tops 38k ft · small hail possible</Text>
          </View>

          {/* Basemap attribution */}
          <Text style={styles.basemapTag}>Basemap · terrain tiles</Text>
        </View>

        {/* ── Timeline scrubber ───────────────────────────────── */}
        <View style={styles.scrub}>
          <View style={styles.scrubHead}>
            <Text style={styles.scrubFrame}>
              {frameLabel}
              {isAtNow ? <Text style={styles.scrubNow}> · Now</Text> : null}
            </Text>
            <Text style={styles.scrubStatus}>Loop −2H → +2H · {totalFrames} frames</Text>
          </View>

          <View style={styles.scrubMain}>
            {/* Play / pause */}
            <Pressable
              style={styles.playBtn}
              onPress={() => setIsPlaying(p => !p)}
              hitSlop={8}
            >
              {isPlaying
                ? <IconPlayerPause size={17} color={colors.good} />
                : <IconPlayerPlay  size={17} color={colors.good} />
              }
            </Pressable>

            {/* Track */}
            <View style={styles.trackWrap}>
              <View
                ref={trackViewRef}
                style={styles.track}
                onLayout={e => {
                  const { width } = e.nativeEvent.layout
                  // measure() called in event handler — not during render
                  trackViewRef.current?.measure((_x, _y, _w, _h, px) => {
                    setScrubLayout({ x: px, width })
                  })
                }}
                {...panHandlers}
              >
                <View style={[styles.trackPast, { width: pastWidthPx }]} />
                <View style={[styles.trackNow,  { left: nowLeftPx    }]} />
                <View style={[styles.trackHandle,{ left: handleLeftPx }]} />
              </View>

              <View style={styles.ticks}>
                {['-2H', '-1H', 'NOW', '+1H', '+2H'].map(tick => (
                  <Text
                    key={tick}
                    style={[styles.tick, tick === 'NOW' && styles.tickNow]}
                  >
                    {tick}
                  </Text>
                ))}
              </View>
            </View>
          </View>

          {/* Intensity legend */}
          <View style={styles.legend}>
            <Text style={styles.legendEnd}>Light</Text>
            <LinearGradient
              colors={[
                'rgba(144,205,244,0.40)',
                'rgba(63,131,248,0.85)',
                'rgba(246,173,85,0.85)',
                'rgba(252,129,129,0.95)',
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.legendBar}
            />
            <Text style={styles.legendEnd}>Heavy</Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe:     { flex: 1 },

  topTime: {
    fontFamily: fonts.display,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.32,
    color: colors.txt4,
    textTransform: 'uppercase',
  },

  layerRow: { flexShrink: 0 },
  layerRowContent: {
    flexDirection: 'row',
    gap: spacing.chipGapMd,
    paddingHorizontal: spacing.screenH,
    paddingVertical: 12,
  },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.inner,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  layerChipActive: {
    backgroundColor: 'rgba(184,245,66,0.13)',
    borderColor: 'rgba(184,245,66,0.32)',
  },
  layerChipText: {
    fontFamily: fonts.display,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    color: colors.txt3,
  },
  layerChipTextActive: {
    color: colors.good,
  },

  map: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.mapCanvas,
  },
  mapBase: {
    backgroundColor: colors.mapCanvas,
  },

  hereWrap: {
    position: 'absolute',
    left: '40%',
    top: '62%',
  },
  here: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -17 }, { translateY: -17 }],
  },
  hereRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(184,245,66,0.5)',
  },
  hereCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.good,
    borderWidth: 2,
    borderColor: colors.mapCanvas,
  },

  pin: {
    position: 'absolute',
    alignItems: 'center',
    gap: 4,
    transform: [{ translateX: -5 }, { translateY: -5 }],
  },
  pinDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  pinGood:    { backgroundColor: colors.good },
  pinFair:    { backgroundColor: colors.fair },
  pinNeutral: { backgroundColor: colors.txt2 },
  pinChip: {
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(10,12,16,0.7)',
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.txt2,
    overflow: 'hidden',
  },

  callout: {
    position: 'absolute',
    left: '44%',
    top: '26%',
    backgroundColor: 'rgba(10,12,16,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(252,129,129,0.4)',
    borderRadius: radius.inner,
    padding: 9,
    maxWidth: 150,
  },
  calloutLabel: {
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    color: colors.poor,
    marginBottom: 2,
  },
  calloutText: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 14,
    color: colors.txt2,
  },

  basemapTag: {
    position: 'absolute',
    left: 10,
    bottom: 8,
    fontFamily: fonts.body,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.12,
    textTransform: 'uppercase',
    color: 'rgba(226,232,240,0.30)',
  },

  scrub: {
    flexShrink: 0,
    backgroundColor: 'rgba(10,12,16,0.5)',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: spacing.screenH,
    paddingTop: 13,
    paddingBottom: 14,
    gap: 10,
  },
  scrubHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  scrubFrame: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '700',
    color: colors.txt1,
  },
  scrubNow: {
    color: colors.rain,
  },
  scrubStatus: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.txt3,
  },
  scrubMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(184,245,66,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(184,245,66,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  trackWrap: { flex: 1 },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(226,232,240,0.10)',
    position: 'relative',
  },
  trackPast: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: 'rgba(99,179,237,0.55)',
  },
  trackNow: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 11,
    backgroundColor: colors.txt2,
    borderRadius: 1,
  },
  trackHandle: {
    position: 'absolute',
    top: '50%',
    marginTop: -7,
    marginLeft: -7,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: colors.good,
    borderWidth: 2,
    borderColor: colors.mapCanvas,
  },
  ticks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  tick: {
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.54,
    color: colors.txt5,
  },
  tickNow: {
    color: colors.txt2,
    fontWeight: '700',
  },

  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendEnd: {
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
    color: colors.txt4,
  },
  legendBar: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
})
