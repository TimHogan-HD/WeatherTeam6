import { useState } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, fonts } from '@weatherteam6/design/tokens'
import { TopBar } from '../../src/components/TopBar'
import { useTrips } from '../../src/hooks/useTrips'
import { useCreateTrip } from '../../src/hooks/useCreateTrip'
import { TripCreationModal } from '../../src/components/trips/TripCreationModal'
import type { Trip, CreateTripInput } from '@weatherteam6/types'

// ─── confidence helpers ───────────────────────────────────────────────────────

function confidenceLevel(daysOut: number): { pct: number; label: 'High' | 'Medium' | 'Low' } {
  if (daysOut <= 7) return { pct: 85, label: 'High' }
  if (daysOut <= 14) return { pct: 55, label: 'Medium' }
  return { pct: 25, label: 'Low' }
}

function confidenceColor(label: 'High' | 'Medium' | 'Low'): string {
  if (label === 'High') return colors.good
  if (label === 'Medium') return colors.fair
  return colors.txt4
}

function daysUntil(dateIso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateIso + 'T00:00:00')
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000))
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(s)} – ${fmt(e)}`
}

// ─── Trip card ────────────────────────────────────────────────────────────────

type TripCardProps = {
  trip: Trip
}

function TripCard({ trip }: TripCardProps) {
  const daysOut = daysUntil(trip.startDate)
  const conf = confidenceLevel(daysOut)
  const badgeColor = confidenceColor(conf.label)
  const cragCount = trip.locations?.length ?? 0

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.tripName} numberOfLines={1}>{trip.name}</Text>
          <Text style={s.tripMeta}>
            {cragCount} {cragCount === 1 ? 'crag' : 'crags'}
            {' · '}
            {formatDateRange(trip.startDate, trip.endDate)}
          </Text>
          <Text style={s.tripDaysOut}>{daysOut} days out</Text>
        </View>
        <View style={[s.badge, { borderColor: badgeColor + '55' }]}>
          <Text style={[s.badgePct, { color: badgeColor }]}>{conf.pct}%</Text>
          <Text style={[s.badgeLabel, { color: badgeColor }]}>{conf.label}</Text>
        </View>
      </View>
      {/* Mini progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${conf.pct}%` as unknown as number, backgroundColor: badgeColor }]} />
      </View>
    </View>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>No trips yet</Text>
      <Text style={s.emptyBody}>
        Plan a climbing trip to track forecast confidence as your date nears.
      </Text>
      <Pressable style={s.emptyBtn} onPress={onNew}>
        <Text style={s.emptyBtnText}>+ Plan your first trip</Text>
      </Pressable>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TripsScreen() {
  const [modalOpen, setModalOpen] = useState(false)

  const { data: trips, isLoading, isError, refetch } = useTrips()
  const createTrip = useCreateTrip()

  async function handleCreateTrip(input: CreateTripInput): Promise<void> {
    await createTrip.mutateAsync(input)
  }

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={s.gradient}
    >
      <SafeAreaView style={s.safe} edges={['top']}>
        <TopBar title="Trips" />

        {isLoading && (
          <View style={s.center}>
            <ActivityIndicator color={colors.good} />
          </View>
        )}

        {isError && (
          <View style={s.center}>
            <Text style={s.errorText}>Could not load trips</Text>
            <Pressable onPress={() => refetch()} hitSlop={12}>
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {!isLoading && !isError && (trips == null || trips.length === 0) && (
          <EmptyState onNew={() => setModalOpen(true)} />
        )}

        {!isLoading && !isError && trips && trips.length > 0 && (
          <FlatList
            data={trips}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <TripCard trip={item} />}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={<View style={{ height: 24 }} />}
          />
        )}

        {/* New trip FAB */}
        {!isLoading && !isError && trips && trips.length > 0 && (
          <View style={s.fabWrap}>
            <Pressable style={s.fab} onPress={() => setModalOpen(true)}>
              <Text style={s.fabText}>+  New trip</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>

      <TripCreationModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => setModalOpen(false)}
        onCreateTrip={handleCreateTrip}
      />
    </LinearGradient>
  )
}

const s = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  list: { paddingHorizontal: spacing.screenH, paddingTop: 12 },

  // Card
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tripName: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '700',
    color: colors.txt1,
    textTransform: 'uppercase',
    letterSpacing: 0.36,
  },
  tripMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.txt3, marginTop: 3 },
  tripDaysOut: { fontFamily: fonts.display, fontSize: 11, color: colors.txt4, marginTop: 3, letterSpacing: 0.5 },
  badge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 56,
  },
  badgePct: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  badgeLabel: {
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(226,232,240,0.08)',
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: 2 },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '700',
    color: colors.txt1,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.txt3,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 10,
  },
  emptyBtn: {
    marginTop: 24,
    backgroundColor: colors.good,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyBtnText: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '700',
    color: colors.onGood,
  },

  // FAB
  fabWrap: {
    paddingHorizontal: spacing.screenH,
    paddingBottom: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: 'rgba(10,12,16,0.5)',
  },
  fab: {
    backgroundColor: colors.good,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  fabText: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '700',
    color: colors.onGood,
    letterSpacing: 0.4,
  },

  // Error
  errorText: { fontFamily: fonts.body, fontSize: 14, color: colors.txt3 },
  retryText: { fontFamily: fonts.display, fontSize: 14, fontWeight: '600', color: colors.good },
})
