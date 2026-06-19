import { Tabs } from 'expo-router'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="locations" />
      <Tabs.Screen name="trips" />
      <Tabs.Screen name="radar" />
    </Tabs>
  )
}
