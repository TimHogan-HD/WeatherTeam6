import { QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { queryClient } from '../src/lib/queryClient';

function SearchLink() {
  return (
    <Pressable onPress={() => router.push('/search')} hitSlop={8}>
      <Text style={styles.searchLink}>Search</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{ title: 'Locations', headerRight: () => <SearchLink /> }}
        />
      </Stack>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  searchLink: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '500',
  },
});
