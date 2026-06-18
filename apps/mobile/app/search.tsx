import { useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  IconCheck,
  IconMapPin,
  IconSearch,
  IconX,
} from '@tabler/icons-react-native'
import { colors, radius, spacing, type as t } from '@weatherteam6/design/tokens'
import { TopBar } from '../src/components/TopBar'
import { useLocations } from '../src/hooks/useLocations'
import { useSaveLocation } from '../src/hooks/useSaveLocation'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface SearchResult {
  id: string
  name: string
  region: string
  rock_type: string
  distance: string
  is_climbing_location: boolean
}

// ─────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────

const MOCK_RESULTS: SearchResult[] = [
  { id: 'mock-1', name: 'Red Rock Canyon', region: 'Nevada', rock_type: 'Sandstone', distance: '2.1 mi', is_climbing_location: true },
  { id: 'mock-2', name: 'Joshua Tree NP', region: 'California', rock_type: 'Granite', distance: '45 mi', is_climbing_location: true },
  { id: 'mock-3', name: 'Yosemite Valley', region: 'California', rock_type: 'Granite', distance: '220 mi', is_climbing_location: true },
  { id: 'mock-4', name: 'Smith Rock State Park', region: 'Oregon', rock_type: 'Rhyolite', distance: '380 mi', is_climbing_location: true },
  { id: 'mock-5', name: 'Rifle Mountain Park', region: 'Colorado', rock_type: 'Limestone', distance: '520 mi', is_climbing_location: true },
]

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface MockResultRowProps {
  item: SearchResult
  selected: boolean
  onToggle: (id: string) => void
}

function MockResultRow({ item, selected, onToggle }: MockResultRowProps) {
  const subLabel = `${item.region} · ${item.rock_type}${item.distance ? ' · ' + item.distance : ''}`

  return (
    <Pressable
      style={[styles.resultRow, selected && styles.resultRowSelected]}
      onPress={() => onToggle(item.id)}
    >
      <IconMapPin size={18} color={selected ? colors.good : colors.txt3} />
      <View style={styles.resultCenter}>
        <Text style={styles.resultName}>{item.name}</Text>
        <Text style={styles.resultSub}>{subLabel}</Text>
      </View>
      {selected ? <IconCheck size={18} color={colors.good} /> : null}
    </Pressable>
  )
}

interface LocationRowProps {
  id: string
  name: string
  subLabel: string
  selected: boolean
  onToggle: (id: string) => void
}

function LocationRow({ id, name, subLabel, selected, onToggle }: LocationRowProps) {
  return (
    <Pressable
      style={[styles.resultRow, selected && styles.resultRowSelected]}
      onPress={() => onToggle(id)}
    >
      <IconMapPin size={18} color={selected ? colors.good : colors.txt3} />
      <View style={styles.resultCenter}>
        <Text style={styles.resultName}>{name}</Text>
        <Text style={styles.resultSub}>{subLabel}</Text>
      </View>
      {selected ? <IconCheck size={18} color={colors.good} /> : null}
    </Pressable>
  )
}

// ─────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────

export default function Search() {
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const locationsQ = useLocations()
  const saveLocation = useSaveLocation()

  const locations = locationsQ.data ?? []

  const filteredResults = query.length >= 1
    ? MOCK_RESULTS.filter(item =>
        item.name.toLowerCase().includes(query.toLowerCase())
      )
    : []

  function toggleId(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function handleAdd() {
    selectedIds.forEach(id => saveLocation.mutate(id))
    setSelectedIds(new Set())
  }

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* TopBar */}
        <TopBar title="Search" />

        {/* Search bar */}
        <View style={styles.searchBarWrap}>
          <View style={styles.searchBar}>
            <IconSearch size={18} color={colors.txt3} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search crags and locations…"
              placeholderTextColor={colors.txt4}
              selectionColor={colors.good}
              editable={true}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <IconX size={16} color={colors.txt3} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Results area */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {query === '' ? (
            /* Pre-search: recent locations */
            locations.length > 0 ? (
              <>
                <Text style={styles.sectionHeader}>Recent</Text>
                {locations.map(loc => (
                  <LocationRow
                    key={loc.id}
                    id={loc.id}
                    name={loc.name}
                    subLabel={loc.asos_station ?? loc.rock_type ?? 'Saved location'}
                    selected={selectedIds.has(loc.id)}
                    onToggle={toggleId}
                  />
                ))}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Search for crags and locations</Text>
              </View>
            )
          ) : (
            /* Search results */
            filteredResults.length > 0 ? (
              filteredResults.map(item => (
                <MockResultRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onToggle={toggleId}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{`No results for "${query}"`}</Text>
              </View>
            )
          )}
        </ScrollView>

        {/* Sticky add button */}
        {selectedIds.size > 0 ? (
          <View style={styles.addBar}>
            <Pressable style={styles.addBtn} onPress={handleAdd}>
              <Text style={styles.addBtnText}>
                {`Add ${selectedIds.size} location${selectedIds.size > 1 ? 's' : ''}`}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  searchBarWrap: {
    paddingHorizontal: spacing.screenH,
    paddingBottom: spacing.listGap,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.inlineGap,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.input,
    padding: spacing.cardPadSm,
  },
  searchInput: {
    ...t.bodyMd,
    flex: 1,
    color: colors.txt1,
    padding: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenH,
    paddingBottom: spacing.bottomInset,
  },
  sectionHeader: {
    ...t.label,
    marginBottom: spacing.listGap,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.inlineGap,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: spacing.cardPad,
    marginBottom: spacing.listGap,
  },
  resultRowSelected: {
    backgroundColor: colors.goodTint,
    borderColor: colors.goodTintBorder,
  },
  resultCenter: {
    flex: 1,
  },
  resultName: {
    ...t.bodyMd,
    color: colors.txt1,
    fontWeight: '600',
  },
  resultSub: {
    ...t.bodySm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.topSafe,
  },
  emptyText: {
    ...t.bodyMd,
    color: colors.txt4,
    textAlign: 'center',
  },
  addBar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    padding: spacing.cardPad,
  },
  addBtn: {
    backgroundColor: colors.good,
    borderRadius: radius.card,
    width: '100%',
    padding: spacing.cardPad,
    alignItems: 'center',
  },
  addBtnText: {
    ...t.bodyMd,
    color: colors.onGood,
    fontWeight: '600',
  },
})
