import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, radius, spacing, type as t } from '@weatherteam6/design/tokens'
import type { Location } from '@weatherteam6/types'
import { useLocations } from '../../src/hooks/useLocations'
import { TopBar } from '../../src/components/TopBar'

function subtitle(location: Location): string {
  const parts = [location.rock_type, location.aspect].filter(
    (p): p is string => p !== null,
  )
  return parts.length > 0 ? parts.join(' · ') : 'General weather'
}

function LocationCard({ location }: { location: Location }) {
  return (
    <Pressable
      style={styles.card}
      onPress={() =>
        router.push({ pathname: '/location/[id]', params: { id: location.id } })
      }
    >
      <View style={styles.cardText}>
        <Text style={styles.cardName}>{location.name}</Text>
        <Text style={styles.cardSub}>{subtitle(location)}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

export default function LocationsScreen() {
  const { data, isPending, isError } = useLocations()

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Locations" />
        {isPending ? (
          <View style={styles.center}><Text style={t.bodyMd}>Loading…</Text></View>
        ) : isError ? (
          <View style={styles.center}><Text style={{ color: colors.poor }}>Failed to load locations</Text></View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <LocationCard location={item} />}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={t.bodyMd}>No saved locations yet.</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  list: { padding: spacing.screenH, gap: spacing.listGap },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: spacing.cardPad,
  },
  cardText: { flex: 1 },
  cardName: { ...t.bodyMd, color: colors.txt1, fontWeight: '600', fontSize: 15 },
  cardSub: { ...t.bodySm, marginTop: 2 },
  chevron: { fontSize: 20, color: colors.txt3, marginLeft: 8 },
})
