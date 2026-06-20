import React, { useRef, useEffect, useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react-native'
import { colors, spacing, fonts } from '@weatherteam6/design/tokens'
import { TopBar } from '../../src/components/TopBar'
import { RadarMapView } from '../../src/components/RadarMapView'
import { useRadarFrames } from '../../src/hooks/useRadarFrames'
import { useLocations } from '../../src/hooks/useLocations'

// ─── HereMarker ──────────────────────────────────────────────────────────────

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

// ─── RadarScreen ─────────────────────────────────────────────────────────────

type ScrubLayout = { x: number; width: number }

export default function RadarScreen() {
  const [frameIndex, setFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying]   = useState(false)
  const [scrubLayout, setScrubLayout] = useState<ScrubLayout>({ x: 0, width: 260 })
  const [mountMs]   = useState(() => Date.now())
  const [mountDate] = useState(() => new Date())

  const trackViewRef = useRef<View>(null)

  const { data: framesData } = useRadarFrames()
  const { data: locations }  = useLocations()

  const allFrames = useMemo(
    () => [...(framesData?.past ?? []), ...(framesData?.nowcast ?? [])],
    [framesData],
  )
  const nowIndex = Math.max(0, (framesData?.past?.length ?? 1) - 1)
  const totalFrames = allFrames.length || 12  // fallback prevents division-by-zero; only used in math

  // Play loop
  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % totalFrames)
    }, 600)
    return () => clearInterval(id)
  }, [isPlaying, totalFrames])

  const currentFrame = allFrames[frameIndex]
  const frameDateMs  = currentFrame ? currentFrame.time * 1000 : mountMs
  const frameLabel   = new Date(frameDateMs).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  const isAtNow = allFrames.length > 0 ? frameIndex === nowIndex : true

  const handleFraction = totalFrames > 1 ? frameIndex / (totalFrames - 1) : 0
  const nowFraction    = totalFrames > 1 ? nowIndex  / (totalFrames - 1) : 0.5
  const pastWidthPx    = nowFraction    * scrubLayout.width
  const nowLeftPx      = nowFraction    * scrubLayout.width - 1
  const handleLeftPx   = handleFraction * scrubLayout.width - 7

  // Scrubber PanResponder
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

  const dayStr = mountDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar
          title="Radar"
          rightElement={
            <Text style={styles.topTime}>{dayStr} {frameLabel}</Text>
          }
        />

        {/* ── Full-bleed radar map + floating scrubber ─────────── */}
        <View style={styles.mapWrap}>
          <RadarMapView
            frames={allFrames}
            frameIndex={frameIndex}
            tileUrlTemplate={framesData?.tileUrlTemplate ?? null}
            locations={locations ?? []}
          />

          {/* "You are here" — overlaid on the map, positioned near screen centre */}
          <View style={styles.hereWrap} pointerEvents="none">
            <HereMarker />
          </View>

          <Text style={styles.basemapTag}>Radar © RainViewer · Map © CARTO / OSM</Text>

          {/* ── Timeline scrubber — floats over map bottom ───────── */}
          <View style={styles.scrub}>
            <View style={styles.scrubHead}>
              <Text style={styles.scrubFrame}>
                {frameLabel}
                {isAtNow ? <Text style={styles.scrubNow}> · Now</Text> : null}
              </Text>
              <Text style={styles.scrubStatus}>
                {allFrames.length > 0 ? `Loop −2H → +2H · ${allFrames.length} frames` : 'Loading radar…'}
              </Text>
            </View>

            <View style={styles.scrubMain}>
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

              <View style={styles.trackWrap}>
                <View
                  ref={trackViewRef}
                  style={styles.track}
                  onLayout={e => {
                    const { width } = e.nativeEvent.layout
                    trackViewRef.current?.measure((_x, _y, _w, _h, px) => {
                      setScrubLayout({ x: px, width })
                    })
                  }}
                  {...panHandlers}
                >
                  <View style={[styles.trackPast,   { width: pastWidthPx  }]} />
                  <View style={[styles.trackNow,    { left: nowLeftPx     }]} />
                  <View style={[styles.trackHandle, { left: handleLeftPx  }]} />
                </View>

                <View style={styles.ticks}>
                  {['-2H', '-1H', 'NOW', '+1H', '+2H'].map(tick => (
                    <Text key={tick} style={[styles.tick, tick === 'NOW' && styles.tickNow]}>
                      {tick}
                    </Text>
                  ))}
                </View>
              </View>
            </View>

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

  mapWrap: {
    flex: 1,
    overflow: 'hidden',
  },

  hereWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    pointerEvents: 'none',
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
    borderColor: '#0d1117',
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
    pointerEvents: 'none',
  },

  scrub: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: 'rgba(10,12,16,0.68)',
    paddingHorizontal: spacing.screenH,
    paddingTop: 13,
    paddingBottom: 16,
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
  scrubNow: { color: colors.rain },
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
    borderColor: '#0d1117',
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
