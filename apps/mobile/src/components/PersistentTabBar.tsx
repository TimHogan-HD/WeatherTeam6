import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, usePathname } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing } from '@weatherteam6/design/tokens'

const TABS = [
  { key: 'home',      label: 'HOME',      icon: '⌂', href: '/'           },
  { key: 'locations', label: 'LOCATIONS', icon: '⊙', href: '/locations'  },
  { key: 'trips',     label: 'TRIPS',     icon: '◈', href: '/trips'      },
  { key: 'radar',     label: 'RADAR',     icon: '⊕', href: '/radar'      },
] as const

function resolveActiveTab(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/(tabs)/index') || pathname === '/index') return 'home'
  if (pathname.startsWith('/locations') || pathname.startsWith('/location/') || pathname === '/search' || pathname.startsWith('/walls/')) return 'locations'
  if (pathname.startsWith('/trips')) return 'trips'
  if (pathname.startsWith('/radar')) return 'radar'
  return 'home'
}

export function PersistentTabBar() {
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const activeTab = resolveActiveTab(pathname)

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {TABS.map((tab) => {
        const active = activeTab === tab.key
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => router.navigate(tab.href as never)}
          >
            <Text style={[styles.icon, active ? styles.activeText : styles.inactiveText]}>
              {tab.icon}
            </Text>
            <Text style={[styles.label, active ? styles.activeText : styles.inactiveText]}>
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bgGradientBottom,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    height: 56 + spacing.bottomInset,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: 8,
  },
  icon: {
    fontSize: 18,
    lineHeight: 22,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontFamily: 'BarlowCondensed',
  },
  activeText: {
    color: colors.good,
  },
  inactiveText: {
    color: colors.txt3,
  },
})
