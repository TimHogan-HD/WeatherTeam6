import { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import {
  IconCurrentLocation,
  IconMapPin,
  IconSearch,
} from '@tabler/icons-react-native'
import { colors, fonts, radius, spacing, type as t } from '@weatherteam6/design/tokens'
import type { Location } from '@weatherteam6/types'
import { useLocations } from '../../src/hooks/useLocations'
import { useConditions } from '../../src/hooks/useConditions'
import { useNearbyLocations } from '../../src/hooks/useNearbyLocations'
import { TopBar } from '../../src/components/TopBar'

// ─── Score helpers ──────────────────────────────────────────────────────────

function scoreColor(s: number | null): string {
  if (s === null) return colors.txt3
  if (s >= 60) return colors.good
  if (s >= 40) return colors.fair
  return colors.poor
}

function scoreBg(s: number | null): string {
  if (s === null) return colors.card
  if (s >= 60) return 'rgba(184,245,66,0.12)'
  if (s >= 40) return 'rgba(246,173,85,0.12)'
  return 'rgba(252,129,129,0.12)'
}

function tierLabel(s: number | null): string {
  if (s === null) return ''
  if (s >= 60) return 'Good'
  if (s >= 40) return 'Fair'
  return 'Poor'
}

// ─── Day abbreviations ──────────────────────────────────────────────────────

function dayAbbrev(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

// ─── Sub-tab / filter types ─────────────────────────────────────────────────

type TabKey = 'all' | 'crags'
type AllFilter = 'Saved' | 'Nearby'
type CragsFilter = 'Saved' | 'Nearby' | 'Climbable'

// ─── Right element for TopBar ────────────────────────────────────────────────

function LocationsRightElement() {
  return <IconMapPin size={20} color={colors.txt3} />
}

// ─── Pill chip ───────────────────────────────────────────────────────────────

function Chip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
        {label}
      </Text>
    </Pressable>
  )
}

// ─── All Locations row ────────────────────────────────────────────────────────

function LocationRow({
  location,
  index,
  expanded,
  onToggle,
}: {
  location: Location
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const router = useRouter()

  return (
    <View style={styles.rowCard}>
      <Pressable onPress={onToggle} style={styles.rowMain}>
        {/* Left icon */}
        <View style={styles.rowIcon}>
          {index === 0 ? (
            <IconCurrentLocation size={18} color={colors.good} />
          ) : (
            <IconMapPin size={18} color={colors.txt3} />
          )}
        </View>

        {/* Center */}
        <View style={styles.rowCenter}>
          <Text style={styles.rowName}>{location.name}</Text>
          <Text style={styles.rowSub}>
            {location.asos_station ?? 'Saved location'}
          </Text>
        </View>

        {/* Right */}
        <View style={styles.rowRight}>
          <Text style={styles.rowTemp}>{'—°'}</Text>
          <Text
            style={[
              styles.chevron,
              expanded && styles.chevronExpanded,
            ]}
          >
            {'›'}
          </Text>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.expandedContent}>
          {/* 4-stat strip */}
          <View style={styles.statStrip}>
            {[
              { label: 'Humidity', value: '—%' },
              { label: 'Wind', value: '— mph' },
              { label: 'Precip', value: '—"' },
              { label: 'Visibility', value: '— mi' },
            ].map((stat) => (
              <View key={stat.label} style={styles.statCell}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statValue}>{stat.value}</Text>
              </View>
            ))}
          </View>

          {/* 3-day mini strip */}
          <View style={styles.miniStrip}>
            {[0, 1, 2].map((offset) => (
              <View key={offset} style={styles.miniCell}>
                <Text style={styles.miniDay}>{dayAbbrev(offset)}</Text>
                <Text style={styles.miniTemp}>{'—°'}</Text>
                <Text style={styles.miniPrecip}>{'0%'}</Text>
              </View>
            ))}
          </View>

          {/* Full Weather button */}
          <Pressable
            style={styles.fullBtn}
            onPress={() =>
              router.push({ pathname: '/location/[id]', params: { id: location.id } })
            }
          >
            <Text style={styles.fullBtnText}>Full Weather →</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

// ─── Crag row ─────────────────────────────────────────────────────────────────

function CragRow({
  location,
  expanded,
  onToggle,
}: {
  location: Location
  expanded: boolean
  onToggle: () => void
}) {
  const router = useRouter()
  const conditionsQ = useConditions(location.id)
  const score = conditionsQ.data?.score ?? null

  const subLabel =
    [location.rock_type, location.aspect].filter(Boolean).join(' · ') ||
    'Climbing location'

  return (
    <View style={styles.rowCard}>
      <Pressable onPress={onToggle} style={styles.rowMain}>
        {/* Score badge */}
        <View
          style={[
            styles.scoreBadge,
            { backgroundColor: scoreBg(score) },
          ]}
        >
          <Text style={[styles.scoreNum, { color: scoreColor(score) }]}>
            {conditionsQ.isPending ? '—' : score !== null ? String(score) : '—'}
          </Text>
          {tierLabel(score) !== '' && (
            <Text style={[styles.scoreTier, { color: scoreColor(score) }]}>
              {tierLabel(score)}
            </Text>
          )}
        </View>

        {/* Center */}
        <View style={styles.rowCenter}>
          <Text style={styles.rowName}>{location.name}</Text>
          <Text style={styles.rowSub}>{subLabel}</Text>
        </View>

        {/* Right */}
        <View style={styles.rowRight}>
          <Text style={styles.rowTemp}>{'—°'}</Text>
          <Text style={styles.rowDry}>{'— dry'}</Text>
          <Text
            style={[
              styles.chevron,
              expanded && styles.chevronExpanded,
            ]}
          >
            {'›'}
          </Text>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.expandedContent}>
          {/* 3-day strip with dot */}
          <View style={styles.miniStrip}>
            {[0, 1, 2].map((offset) => (
              <View key={offset} style={styles.miniCell}>
                <View
                  style={[
                    styles.scoreDot,
                    { backgroundColor: scoreColor(score) },
                  ]}
                />
                <Text style={styles.miniDay}>{dayAbbrev(offset)}</Text>
                <Text style={styles.miniTemp}>{'—°'}</Text>
              </View>
            ))}
          </View>

          {/* 4-stat row */}
          <View style={styles.statStrip}>
            {[
              { label: 'Humidity', value: '—%' },
              { label: 'Wind', value: '— mph' },
              { label: 'Dry Since', value: '— hrs' },
              { label: '72H Fcst', value: '—"' },
            ].map((stat) => (
              <View key={stat.label} style={styles.statCell}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statValue}>{stat.value}</Text>
              </View>
            ))}
          </View>

          {/* Drying status */}
          <Text style={styles.dryingStatus}>Conditions data loading…</Text>

          {/* Full Conditions button */}
          <Pressable
            style={styles.fullBtn}
            onPress={() =>
              router.push({ pathname: '/location/[id]', params: { id: location.id } })
            }
          >
            <Text style={styles.fullBtnText}>Full Conditions →</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LocationsScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  // TODO(Phase-10): 'Climbable' filter requires a consolidated score endpoint.
  // Filter state is captured for chip visual state; list filtering is deferred.
  const [allFilter, setAllFilter] = useState<AllFilter>('Saved')
  const [cragsFilter, setCragsFilter] = useState<CragsFilter>('Saved')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const locationsQ = useLocations()
  const savedLocations: Location[] = locationsQ.data ?? []
  const nearbyLocations = useNearbyLocations({ type: 'all' }).data
  const nearbyCrags = useNearbyLocations({ type: 'crags' }).data

  const savedCrags = savedLocations.filter((l) => l.is_climbing_location)

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* TopBar */}
        <TopBar title="Locations" rightElement={<LocationsRightElement />} />

        {/* Search bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <IconSearch size={16} color={colors.txt3} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search locations…"
              placeholderTextColor={colors.txt4}
              editable={false}
            />
          </View>
        </View>

        {/* Sub-tabs */}
        <View style={styles.tabRow}>
          <Chip
            label="All Locations"
            active={activeTab === 'all'}
            onPress={() => setActiveTab('all')}
          />
          <Chip
            label="Crags"
            active={activeTab === 'crags'}
            onPress={() => setActiveTab('crags')}
          />
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {activeTab === 'all' ? (
            (['Saved', 'Nearby'] as AllFilter[]).map((f) => (
              <Chip
                key={f}
                label={f}
                active={allFilter === f}
                onPress={() => setAllFilter(f)}
              />
            ))
          ) : (
            (['Saved', 'Nearby', 'Climbable'] as CragsFilter[]).map((f) => (
              <Chip
                key={f}
                label={f}
                active={cragsFilter === f}
                onPress={() => setCragsFilter(f)}
              />
            ))
          )}
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'all' ? (
            <>
              {/* Saved locations section */}
              <Text style={styles.sectionHeader}>
                {`Saved · ${savedLocations.length} location${savedLocations.length === 1 ? '' : 's'}`}
              </Text>
              {savedLocations.map((location, index) => (
                <LocationRow
                  key={location.id}
                  location={location}
                  index={index}
                  expanded={expandedId === location.id}
                  onToggle={() => toggleExpanded(location.id)}
                />
              ))}

              {/* Nearby section — hidden while stub returns [] */}
              {nearbyLocations.length > 0 && (
                <>
                  <Text style={styles.sectionHeader}>Nearby · Not saved</Text>
                  {nearbyLocations.map((location, index) => (
                    <LocationRow
                      key={location.id}
                      location={location}
                      index={index}
                      expanded={expandedId === location.id}
                      onToggle={() => toggleExpanded(location.id)}
                    />
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              {/* Saved crags section */}
              <Text style={styles.sectionHeader}>
                {`Saved Crags · ${savedCrags.length} location${savedCrags.length === 1 ? '' : 's'}`}
              </Text>
              {savedCrags.map((location) => (
                <CragRow
                  key={location.id}
                  location={location}
                  expanded={expandedId === location.id}
                  onToggle={() => toggleExpanded(location.id)}
                />
              ))}

              {/* Nearby crags — hidden while stub returns [] */}
              {nearbyCrags.length > 0 && (
                <>
                  <Text style={styles.sectionHeader}>Nearby · Not saved</Text>
                  {nearbyCrags.map((location) => (
                    <CragRow
                      key={location.id}
                      location={location}
                      expanded={expandedId === location.id}
                      onToggle={() => toggleExpanded(location.id)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },

  // Search
  searchRow: {
    paddingHorizontal: spacing.screenH,
    paddingBottom: spacing.cardPadSm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingHorizontal: spacing.cardPadSm,
    paddingVertical: spacing.cardPadSm,
    gap: spacing.inlineGap,
  },
  searchInput: {
    flex: 1,
    ...t.bodyMd,
    color: colors.txt3,
    padding: 0,
  },

  // Sub-tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.screenH,
    gap: spacing.chipGap,
    marginBottom: spacing.listGap,
  },

  // Filter chips
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.screenH,
    gap: spacing.chipGap,
    marginBottom: spacing.cardPadSm,
  },

  // Chip
  chip: {
    paddingVertical: spacing.listGapSm,
    paddingHorizontal: spacing.cardPadSm,
    borderRadius: radius.chipMd,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: 'rgba(184,245,66,0.10)',
    borderColor: 'rgba(184,245,66,0.28)',
  },
  chipInactive: {
    backgroundColor: colors.card,
    borderColor: colors.line,
  },
  chipText: {
    fontFamily: fonts.display,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.good,
  },
  chipTextInactive: {
    color: colors.txt3,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenH,
    paddingBottom: spacing.bottomInset,
  },

  // Section header
  sectionHeader: {
    ...t.label,
    color: colors.txt4,
    marginTop: spacing.sectionTop,
    marginBottom: spacing.listGap,
  },

  // Row card
  rowCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    marginBottom: spacing.listGap,
    overflow: 'hidden',
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.cardPad,
    gap: spacing.inlineGap,
  },
  rowIcon: {
    width: 24,
    alignItems: 'center',
  },
  rowCenter: {
    flex: 1,
  },
  rowName: {
    ...t.bodyMd,
    color: colors.txt1,
    fontWeight: '600',
  },
  rowSub: {
    ...t.bodySm,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rowTemp: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '700',
    color: colors.txt1,
  },
  rowDry: {
    ...t.bodySm,
    color: colors.txt3,
  },
  chevron: {
    fontSize: 18,
    color: colors.txt3,
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '90deg' }],
  },

  // Expanded content
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    padding: spacing.cardPad,
    gap: spacing.cardPadSm,
  },

  // Stat strip
  statStrip: {
    flexDirection: 'row',
    gap: spacing.listGap,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    ...t.labelSm,
    color: colors.txt4,
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '700',
    color: colors.txt1,
  },

  // 3-day mini strip
  miniStrip: {
    flexDirection: 'row',
    gap: spacing.listGap,
  },
  miniCell: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.inner,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    paddingVertical: spacing.listGap,
    gap: 2,
  },
  miniDay: {
    ...t.labelSm,
    color: colors.txt4,
  },
  miniTemp: {
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '700',
    color: colors.txt1,
  },
  miniPrecip: {
    ...t.bodySm,
    color: colors.txt3,
  },

  // Full Weather / Conditions button
  fullBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: spacing.cardPadSm,
    alignItems: 'center',
  },
  fullBtnText: {
    ...t.bodyMd,
    color: colors.good,
  },

  // Drying status
  dryingStatus: {
    ...t.bodySm,
    color: colors.txt3,
  },

  // Score badge (CragRow)
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  scoreNum: {
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 18,
  },
  scoreTier: {
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    lineHeight: 10,
  },

  // Score dot in crag 3-day strip
  scoreDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
})
