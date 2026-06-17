import { Tabs } from 'expo-router'
import { colors, spacing } from '@weatherteam6/design/tokens'
import { Text } from 'react-native'

function TabIcon({ focused, label }: { focused: boolean; label: string }) {
  return (
    <Text style={{ fontSize: 11, color: focused ? colors.good : colors.txt3, marginTop: 2 }}>
      {label}
    </Text>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0d1117',
          borderTopColor: colors.line,
          height: 56 + spacing.bottomInset,
          paddingBottom: spacing.bottomInset,
        },
        tabBarActiveTintColor: colors.good,
        tabBarInactiveTintColor: colors.txt3,
        tabBarLabelStyle: {
          fontFamily: 'BarlowCondensed',
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="⌂" />,
        }}
      />
      <Tabs.Screen
        name="locations"
        options={{
          title: 'Locations',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="⊙" />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="◈" />,
        }}
      />
      <Tabs.Screen
        name="radar"
        options={{
          title: 'Radar',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="⊕" />,
        }}
      />
    </Tabs>
  )
}
