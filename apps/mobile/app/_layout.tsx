import { QueryClientProvider } from '@tanstack/react-query'
import { Slot } from 'expo-router'
import { queryClient } from '../src/lib/queryClient'

// Fonts (BarlowCondensed / Barlow) are loaded via expo-font when font asset
// files are added to apps/mobile/assets/fonts/. Until then, the design token
// fontFamily values fall back to the system font.
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  )
}
