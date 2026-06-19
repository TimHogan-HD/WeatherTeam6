import { QueryClientProvider } from '@tanstack/react-query'
import { Slot } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient } from '../src/lib/queryClient'
import { PersistentTabBar } from '../src/components/PersistentTabBar'

// Fonts (BarlowCondensed / Barlow) are loaded via expo-font when font asset
// files are added to apps/mobile/assets/fonts/. Until then, the design token
// fontFamily values fall back to the system font.
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <View style={styles.root}>
          <View style={styles.content}>
            <Slot />
          </View>
          <PersistentTabBar />
        </View>
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
})
