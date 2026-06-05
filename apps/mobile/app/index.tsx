import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Location } from '@weatherteam6/types';
import { useLocations } from '../src/hooks/useLocations';

function subtitle(location: Location): string {
  const parts = [location.rock_type, location.aspect].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(' · ') : 'General weather';
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
        <Text style={styles.cardSubtitle}>{subtitle(location)}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function Index() {
  const { data, isPending, isError, error, refetch } = useLocations();

  if (isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error.message}</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <LocationCard location={item} />}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No saved locations yet.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
    marginBottom: 12,
  },
  cardText: {
    flex: 1,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 13,
    marginTop: 4,
    opacity: 0.6,
  },
  chevron: {
    fontSize: 24,
    opacity: 0.3,
    marginLeft: 12,
  },
  errorText: {
    color: '#b91c1c',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#18181b',
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  emptyText: {
    opacity: 0.6,
  },
});
