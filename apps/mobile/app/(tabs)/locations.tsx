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
import type { Crag, Location } from '@weatherteam6/types'
import { useLocations } from '../../src/hooks/useLocations'
import { useConditions } from '../../src/hooks/useConditions'
import { useNearbyLocations } from '../../src/hooks/useNearbyLocations'
import { useSaveLocation } from '../../src/hooks/useSaveLocation'
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
}: {
  location: Location
  index: number
}) {
  const router = useRouter()

  return (
    <Pressable
      style={styles.rowCard}
      onPress={() => router.push({ pathname: '/location/[id]', params: { id: location.id, from: 'locations' } })}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowIcon}>
          {index === 0 ? (
            <IconCurrentLocation size={18} color={colors.good} />
          ) : (
            <IconMapPin size={18} color={colors.txt3} />
          )}
        </View>
        <View style={styles.rowCenter}>
          <Text style={styles.rowName}>{location.name}</Text>
          <Text style={styles.rowSub}>
            {location.asos_station ?? 'Saved location'}
          </Text>
        </View>
        <Text style={styles.chevron}>{'›'}</Text>
      </View>
    </Pressable>
  )
}

// ─── Crag row ─────────────────────────────────────────────────────────────────

function CragRow({ location }: { location: Location }) {
  const router = useRouter()
  const conditionsQ = useConditions(location.id)
  const score = conditionsQ.data?.score ?? null

  const subLabel =
    [location.rock_type, location.aspect].filter((p): p is string => p !== null && p !== undefined).join(' · ') ||
    'Climbing location'

  return (
    <Pressable
      style={styles.rowCard}
      onPress={() => router.push({ pathname: '/location/[id]', params: { id: location.id, from: 'locations' } })}
    >
      <View style={styles.rowMain}>
        <View style={[styles.scoreBadge, { backgroundColor: scoreBg(score) }]}>
          <Text style={[styles.scoreNum, { color: scoreColor(score) }]}>
            {conditionsQ.isPending ? '—' : score !== null ? String(score) : '—'}
          </Text>
          {tierLabel(score) !== '' && (
            <Text style={[styles.scoreTier, { color: scoreColor(score) }]}>
              {tierLabel(score)}
            </Text>
          )}
        </View>
        <View style={styles.rowCenter}>
          <Text style={styles.rowName}>{location.name}</Text>
          <Text style={styles.rowSub}>{subLabel}</Text>
        </View>
        <Text style={styles.chevron}>{'›'}</Text>
      </View>
    </Pressable>
  )
}

// ─── Nearby crag row (not yet saved) ─────────────────────────────────────────

function NearbyCragRow({
  crag,
  onAdd,
  saving,
}: {
  crag: Crag
  onAdd: (cragId: string) => void
  saving: boolean
}) {
  const locationParts = [crag.area_name, crag.state].filter(Boolean).join(', ')
  const subLabel = locationParts || (crag.rock_type ?? 'Climbing area')

  return (
    <View style={styles.rowCard}>
      <View style={styles.rowMain}>
        <View style={styles.rowIcon}>
          <IconMapPin size={18} color={colors.txt3} />
        </View>
        <View style={styles.rowCenter}>
          <Text style={styles.rowName}>{crag.name}</Text>
          <Text style={styles.rowSub}>{subLabel}</Text>
        </View>
        <Pressable
          onPress={() => onAdd(crag.id)}
          disabled={saving}
          style={styles.addCragBtn}
        >
          <Text style={styles.addCragBtnText}>{saving ? '…' : '+'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LocationsScreen() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  // TODO(Phase-10): 'Climbable' filter requires a consolidated score endpoint.
  // Filter state is captured for chip visual state; list filtering is deferred.
  const [allFilter, setAllFilter] = useState<AllFilter>('Saved')
  const [cragsFilter, setCragsFilter] = useState<CragsFilter>('Saved')

  const locationsQ = useLocations()
  const savedLocations: Location[] = locationsQ.data ?? []
  const nearbyCrags: Crag[] = useNearbyLocations({ type: 'crags' }).data
  const saveLocation = useSaveLocation()

  const savedCrags = savedLocations.filter((l) => l.is_climbing_location)

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* TopBar */}
        <TopBar title="Locations" rightElement={<LocationsRightElement />} />

        {/* Search bar — tappable stub that opens the search screen */}
        <Pressable style={styles.searchRow} onPress={() => router.push('/search' as never)}>
          <View style={styles.searchBar} pointerEvents="none">
            <IconSearch size={16} color={colors.txt3} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search locations…"
              placeholderTextColor={colors.txt4}
              editable={false}
            />
          </View>
        </Pressable>

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
                />
              ))}

              {nearbyCrags.length > 0 && (
                <>
                  <Text style={styles.sectionHeader}>Nearby · Not saved</Text>
                  {nearbyCrags.map((crag) => (
                    <NearbyCragRow
                      key={crag.id}
                      crag={crag}
                      onAdd={(id) => saveLocation.mutate({ cragId: id })}
                      saving={saveLocation.isPending}
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
                <CragRow key={location.id} location={location} />
              ))}

              {nearbyCrags.length > 0 && (
                <>
                  <Text style={styles.sectionHeader}>Nearby · Not saved</Text>
                  {nearbyCrags.map((crag) => (
                    <NearbyCragRow
                      key={crag.id}
                      crag={crag}
                      onAdd={(id) => saveLocation.mutate({ cragId: id })}
                      saving={saveLocation.isPending}
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
    padding: 0, // neutralize RN TextInput default padding
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
    backgroundColor: colors.goodTint,
    borderColor: colors.goodTintBorder,
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
    marginTop: spacing.micro,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: spacing.micro,
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
    gap: spacing.micro,
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
    gap: spacing.micro,
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
    gap: 1, /* tighter than micro */
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
    borderRadius: radius.tag,
    marginBottom: spacing.micro,
  },

  // Nearby crag row add button
  addCragBtn: {
    paddingHorizontal: spacing.cardPad,
    paddingVertical: spacing.cardPadSm,
    backgroundColor: colors.goodTint,
    borderWidth: 1,
    borderColor: colors.goodTintBorder,
    borderRadius: radius.tag,
  },
  addCragBtnText: {
    ...t.bodyMd,
    color: colors.good,
    fontWeight: '700',
  },
})
