import { useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ActivityIndicator,
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
import { router } from 'expo-router'
import { colors, radius, spacing, type as t } from '@weatherteam6/design/tokens'
import type { Crag, Location } from '@weatherteam6/types'
import { TopBar } from '../src/components/TopBar'
import { useLocations } from '../src/hooks/useLocations'
import { useSaveLocation } from '../src/hooks/useSaveLocation'
import { useSearchCrags } from '../src/hooks/useSearchCrags'

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface CragResultRowProps {
  item: Crag
  selected: boolean
  onToggle: (id: string) => void
}

function CragResultRow({ item, selected, onToggle }: CragResultRowProps) {
  const subLabel = [
    item.area_name,
    item.state,
    item.rock_type,
  ].filter(Boolean).join(' · ')

  return (
    <Pressable
      style={[styles.resultRow, selected && styles.resultRowSelected]}
      onPress={() => onToggle(item.id)}
    >
      <IconMapPin size={18} color={selected ? colors.good : colors.txt3} />
      <View style={styles.resultCenter}>
        <Text style={styles.resultName}>{item.name}</Text>
        {subLabel ? <Text style={styles.resultSub}>{subLabel}</Text> : null}
      </View>
      {selected ? <IconCheck size={18} color={colors.good} /> : null}
    </Pressable>
  )
}

interface RecentLocationRowProps {
  location: Location
  selected: boolean
  onToggle: (id: string) => void
}

function RecentLocationRow({ location, selected, onToggle }: RecentLocationRowProps) {
  const subLabel = location.asos_station ?? location.rock_type ?? 'Saved location'

  return (
    <Pressable
      style={[styles.resultRow, selected && styles.resultRowSelected]}
      onPress={() => onToggle(location.id)}
    >
      <IconMapPin size={18} color={selected ? colors.good : colors.txt3} />
      <View style={styles.resultCenter}>
        <Text style={styles.resultName}>{location.name}</Text>
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
  const searchQ = useSearchCrags(query)

  const savedLocations = locationsQ.data ?? []
  const searchResults = searchQ.data ?? []
  const isSearching = query.trim().length >= 1

  function toggleId(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function handleAdd() {
    selectedIds.forEach(id => saveLocation.mutate({ cragId: id }))
    setSelectedIds(new Set())
  }

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* TopBar */}
        <TopBar
          title="Search"
          showBack
          onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/locations' as never)}
        />

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
          {!isSearching ? (
            savedLocations.length > 0 ? (
              <>
                <Text style={styles.sectionHeader}>Recent</Text>
                {savedLocations.map(loc => (
                  <RecentLocationRow
                    key={loc.id}
                    location={loc}
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
          ) : searchQ.isPending ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={colors.good} />
            </View>
          ) : searchResults.length > 0 ? (
            <>
              <Text style={styles.sectionHeader}>Results</Text>
              {searchResults.map(item => (
                <CragResultRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onToggle={toggleId}
                />
              ))}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{`No results for "${query}"`}</Text>
            </View>
          )}
        </ScrollView>

        {/* Sticky add button */}
        {selectedIds.size > 0 ? (
          <View style={styles.addBar}>
            <Pressable style={styles.addBtn} onPress={handleAdd} disabled={saveLocation.isPending}>
              <Text style={styles.addBtnText}>
                {saveLocation.isPending
                  ? 'Adding…'
                  : `Add ${selectedIds.size} location${selectedIds.size > 1 ? 's' : ''}`}
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
