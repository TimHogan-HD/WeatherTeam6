import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { IconList, IconLayoutGrid } from '@tabler/icons-react-native'
import { colors, type as t, spacing, radius, components as c } from '@weatherteam6/design/tokens'
import type { Wall } from '@weatherteam6/types'
import { useLocation } from '../../src/hooks/useLocation'
import { useWalls } from '../../src/hooks/useWalls'
import { SunArc } from '../../src/components/walls/SunArc'
import { WallSetupModal } from '../../src/components/walls/WallSetupModal'
import { computeSunWindow } from '../../src/lib/shadeCalc'

const LAYOUT_KEY = 'walls_layout_mode'
type LayoutMode = 'classic' | 'cards'

// ─── Score helpers ─────────────────────────────────────────────────────────

function scoreColor(s: number | null): string {
  if (s === null) return colors.txt3
  if (s >= 60) return colors.good
  if (s >= 40) return colors.fair
  return colors.poor
}

function bearingToCardinal(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(deg / 22.5) % 16]!
}

// ─── Classic row ────────────────────────────────────────────────────────────

function AspectBadge({ bearing, cardinal }: { bearing: number; cardinal: string }) {
  // SVG-based badge so we can rotate the tick around the badge center (cx=24, cy=24)
  return (
    <View style={rowStyles.badge}>
      <Svg width={48} height={48} viewBox="0 0 48 48">
        {/* Tick rotated around badge center (24,24) */}
        <Rect
          x={22.5} y={3} width={3} height={7} rx={1.5}
          fill={colors.fair}
          rotation={bearing}
          origin="24,24"
        />
      </Svg>
      <Text style={rowStyles.abDir}>{cardinal}</Text>
    </View>
  )
}

function WallRow({ wall }: { wall: Wall }) {
  const score: number | null = null // stubbed until Phase 10
  const cardinal = bearingToCardinal(wall.aspectDeg)

  return (
    <View style={rowStyles.row}>
      {/* Aspect badge */}
      <AspectBadge bearing={wall.aspectDeg} cardinal={cardinal} />

      {/* Info */}
      <View style={rowStyles.info}>
        <Text style={rowStyles.name}>{wall.name}</Text>
        <Text style={rowStyles.meta}>
          {wall.routeCount != null ? `${wall.routeCount} routes · ` : ''}
          {bearingToCardinal(wall.aspectDeg)}-facing ·{' '}
          {wall.aspectSource === 'terrain' ? 'terrain-derived' : 'user aspect'}
        </Text>
        <View style={rowStyles.tags}>
          <View style={c.wtagDry}>
            <Text style={rowStyles.wtagText}>Dry</Text>
          </View>
          <View style={c.wtagSun}>
            <Text style={[rowStyles.wtagText, { color: colors.sun }]}>Sun</Text>
          </View>
        </View>
      </View>

      {/* Score */}
      <View style={rowStyles.score}>
        <Text style={[rowStyles.scoreNum, { color: scoreColor(score) }]}>
          {score ?? '–'}
        </Text>
        <Text style={rowStyles.scoreLbl}>Score</Text>
      </View>
    </View>
  )
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  abDir: {
    position: 'absolute',
    fontFamily: 'BarlowCondensed',
    fontSize: 15,
    fontWeight: '700',
    color: colors.txt1,
    lineHeight: 15,
  },
  info: { flex: 1, minWidth: 0 },
  name: {
    ...t.cardTitle,
    color: colors.txt1,
  },
  meta: { ...t.bodySm, marginTop: 2 },
  tags: { flexDirection: 'row', gap: spacing.chipGap, marginTop: 7 },
  wtagText: {
    fontFamily: 'Barlow',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: colors.good,
  },
  score: { flexShrink: 0, alignItems: 'center' },
  scoreNum: {
    fontFamily: 'BarlowCondensed',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 26,
  },
  scoreLbl: {
    fontFamily: 'BarlowCondensed',
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.txt4,
    marginTop: 3,
  },
})

// ─── Data card ──────────────────────────────────────────────────────────────

function WallCard({ wall, lat, lon }: { wall: Wall; lat: number; lon: number }) {
  const score: number | null = null // stubbed until Phase 10
  const sun = computeSunWindow(lat, lon, wall.aspectDeg)

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.top}>
        <View>
          <Text style={cardStyles.name}>{wall.name}</Text>
          <Text style={cardStyles.meta}>
            {bearingToCardinal(wall.aspectDeg)} · {wall.aspectDeg}° · {sun.sunriseFmt} → {sun.sunsetFmt}
          </Text>
        </View>
        <Text style={[cardStyles.score, { color: scoreColor(score) }]}>
          {score ?? '–'}
        </Text>
      </View>
      <View style={cardStyles.row}>
        <View style={cardStyles.stat}>
          <Text style={[cardStyles.statVal, { color: colors.sun }]}>
            {sun.directHours > 0 ? `${sun.directHours} h` : 'None'}
          </Text>
          <Text style={cardStyles.statKey}>Direct sun</Text>
        </View>
        <View style={cardStyles.stat}>
          <Text style={[cardStyles.statVal, { color: colors.good }]}>Dry</Text>
          <Text style={cardStyles.statKey}>Rock state</Text>
        </View>
        <SunArc
          winStart={sun.windowStart}
          winEnd={sun.windowEnd}
          sunT={sun.sunT}
          sunriseFmt={sun.sunriseFmt}
          sunsetFmt={sun.sunsetFmt}
        />
      </View>
      {/* Source badges */}
      <View style={cardStyles.badges}>
        <View style={c.sourceBadge}>
          <Text style={t.sourceBadge}>Aspect · {wall.aspectSource === 'terrain' ? 'Terrain-derived' : 'User-defined'}</Text>
        </View>
        <View style={c.sourceBadge}>
          <Text style={t.sourceBadge}>Angle · user-defined</Text>
        </View>
      </View>
    </View>
  )
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.cardLg,
    padding: spacing.cardPad,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  name: { ...t.cardTitleLg },
  meta: { ...t.bodySm, marginTop: 2 },
  score: {
    fontFamily: 'BarlowCondensed',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 30,
  },
  row: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 13,
    alignItems: 'center',
  },
  stat: {},
  statVal: {
    fontFamily: 'BarlowCondensed',
    fontSize: 15,
    fontWeight: '700',
    color: colors.txt2,
  },
  statKey: {
    fontFamily: 'BarlowCondensed',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.txt4,
    marginTop: 3,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.chipGapMd,
    marginTop: 10,
    flexWrap: 'wrap',
  },
})

// ─── Add wall row ────────────────────────────────────────────────────────────

function AddWallRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={addStyles.row}
      onPress={onPress}
    >
      <Text style={addStyles.plus}>+</Text>
      <Text style={addStyles.label}>Add a wall</Text>
    </Pressable>
  )
}

const addStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    borderRadius: radius.card,
    padding: 16,
  },
  plus: {
    fontFamily: 'BarlowCondensed',
    fontSize: 17,
    fontWeight: '700',
    color: colors.txt3,
    lineHeight: 17,
  },
  label: {
    fontFamily: 'BarlowCondensed',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.txt3,
  },
})

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function WallsScreen() {
  const { locationId } = useLocalSearchParams<{ locationId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { data: location, isLoading: locLoading } = useLocation(locationId)
  const { data: walls = [], isLoading: wallsLoading } = useWalls(locationId)

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('classic')
  const [setupVisible, setSetupVisible] = useState(false)

  // Restore persisted layout mode
  useEffect(() => {
    AsyncStorage.getItem(LAYOUT_KEY).then(val => {
      if (val === 'classic' || val === 'cards') setLayoutMode(val)
    }).catch(() => undefined)
  }, [])

  const toggleLayout = useCallback(() => {
    setLayoutMode(prev => {
      const next = prev === 'classic' ? 'cards' : 'classic'
      AsyncStorage.setItem(LAYOUT_KEY, next).catch(() => undefined)
      return next
    })
  }, [])

  const isLoading = locLoading || wallsLoading
  const lat = location ? parseFloat(String(location.lat)) : 0
  const lon = location ? parseFloat(String(location.lon)) : 0

  type ListItem = { type: 'wall'; wall: Wall } | { type: 'add' }
  const listData: ListItem[] = [
    ...walls.map(w => ({ type: 'wall' as const, wall: w })),
    { type: 'add' as const },
  ]

  function renderItem({ item }: { item: ListItem }) {
    if (item.type === 'add') {
      return <AddWallRow onPress={() => setSetupVisible(true)} />
    }
    if (layoutMode === 'cards') {
      return <WallCard wall={item.wall} lat={lat} lon={lon} />
    }
    return <WallRow wall={item.wall} />
  }

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      locations={[0, 0.4, 1]}
      style={styles.bg}
    >
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>‹  {location?.name ?? 'Back'}</Text>
          </Pressable>
          <Pressable style={styles.layoutToggle} onPress={toggleLayout} hitSlop={12}>
            {layoutMode === 'classic'
              ? <IconLayoutGrid size={20} color={colors.txt3} />
              : <IconList size={20} color={colors.txt3} />
            }
          </Pressable>
        </View>

        {/* Title */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>Walls</Text>
        </View>
        <Text style={styles.subtitle}>
          {isLoading ? 'Loading…' : `${walls.length} defined · scores from current weather + aspect`}
        </Text>

        {/* Source provenance badges */}
        <View style={styles.badgeRow}>
          <View style={c.sourceBadge}>
            <Text style={t.sourceBadge}>Aspect · OpenBeta + terrain</Text>
          </View>
          <View style={c.sourceBadge}>
            <Text style={t.sourceBadge}>Angle · user-defined</Text>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.good} />
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item, i) => item.type === 'wall' ? item.wall.id : `add-${i}`}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: spacing.listGap }} />}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      {/* Wall setup modal */}
      {location && (
        <WallSetupModal
          visible={setupVisible}
          location={location}
          onClose={() => setSetupVisible(false)}
        />
      )}
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  backText: {
    fontFamily: 'BarlowCondensed',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.txt3,
  },
  layoutToggle: {
    padding: 4,
  },
  titleRow: {
    paddingHorizontal: spacing.screenH,
    marginTop: 12,
  },
  title: { ...t.screenTitle },
  subtitle: {
    ...t.screenSub,
    paddingHorizontal: spacing.screenH,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.chipGapMd,
    paddingHorizontal: spacing.screenH,
    paddingTop: 12,
    flexWrap: 'wrap',
  },
  list: {
    paddingHorizontal: spacing.screenH,
    paddingTop: 14,
    paddingBottom: spacing.bottomInset + 16,
  },
})
