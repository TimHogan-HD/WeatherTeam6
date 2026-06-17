import { useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing, type as t } from '@weatherteam6/design/tokens'
import { useLocation } from '../../src/hooks/useLocation'
import { useWeatherObservations } from '../../src/hooks/useWeatherObservations'
import { TopBar } from '../../src/components/TopBar'
import { StatGrid } from '../../src/components/StatGrid'
import { DaylightBar } from '../../src/components/DaylightBar'
import { PrecipLineChart } from '../../src/components/PrecipLineChart'
import { HourlyStrip } from '../../src/components/HourlyStrip'
import { SevenDayTable } from '../../src/components/SevenDayTable'
import { NWSAlertBar } from '../../src/components/NWSAlertBar'
import { WallsButton } from '../../src/components/WallsButton'
import { StatDrillSheet } from '../../src/components/StatDrillSheet'
import { getDaylight } from '../../src/lib/daylight'

function HeroSection({
  tempF,
  condition,
  feelsLikeF,
  todayHighF,
  todayLowF,
}: {
  tempF: number
  condition: string
  feelsLikeF: number
  todayHighF: number
  todayLowF: number
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroTemp}>{tempF}°</Text>
      <Text style={styles.heroCondition}>{condition}</Text>
      <Text style={styles.heroMeta}>Feels like {feelsLikeF}°</Text>
      <Text style={styles.heroMeta}>H:{todayHighF}°  L:{todayLowF}°</Text>
    </View>
  )
}

export default function LocationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: location } = useLocation(id)
  const obsQ = useWeatherObservations(id)
  const obs = obsQ.data

  const [drillStat, setDrillStat] = useState<string | null>(null)

  if (!id) {
    return (
      <LinearGradient colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]} style={styles.gradient}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.center}><Text style={t.bodyMd}>Location not found.</Text></View>
        </SafeAreaView>
      </LinearGradient>
    )
  }

  const subtitle = [location?.rock_type, location?.aspect]
    .filter((p): p is string => p !== null && p !== undefined)
    .join(' · ')

  const daylight = location ? getDaylight(location.lat, location.lon, new Date()) : null

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <TopBar
            title={location?.name ?? 'Location'}
            subtitle={subtitle || undefined}
            showBack
            onBack={() => router.back()}
          />

          <HeroSection
            tempF={obs.tempF}
            condition={obs.condition}
            feelsLikeF={obs.feelsLikeF}
            todayHighF={obs.todayHighF}
            todayLowF={obs.todayLowF}
          />

          <StatGrid
            variant="detail"
            obs={obs}
            daylightHours={daylight?.daylightHours}
            onTileLongPress={(stat) => setDrillStat(stat)}
          />

          {location ? (
            <DaylightBar lat={location.lat} lon={location.lon} />
          ) : null}

          <PrecipLineChart locationId={id} />
          <HourlyStrip locationId={id} />
          <SevenDayTable locationId={id} />
          <NWSAlertBar locationId={id} />

          {location?.is_climbing_location ? (
            <WallsButton locationId={id} />
          ) : null}

          <Text style={styles.drillHint}>Long press any stat tile for model data</Text>
        </ScrollView>

        <StatDrillSheet
          statType={drillStat}
          obs={obs}
          onDismiss={() => setDrillStat(null)}
        />
      </SafeAreaView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hero: {
    paddingHorizontal: spacing.screenH,
    paddingVertical: spacing.sectionTop,
    marginBottom: spacing.sectionTop,
    alignItems: 'center',
  },
  heroTemp: {
    fontFamily: 'BarlowCondensed',
    fontSize: 64,
    fontWeight: '700',
    color: colors.txt1,
    lineHeight: 64,
  },
  heroCondition: {
    ...t.screenSub,
    fontSize: 16,
    marginTop: 4,
    color: colors.txt2,
  },
  heroMeta: {
    ...t.bodyMd,
    marginTop: 3,
  },
  drillHint: {
    ...t.bodySm,
    textAlign: 'right',
    paddingHorizontal: spacing.screenH,
    marginTop: -spacing.sectionTop + 4,
    marginBottom: spacing.sectionTop,
    opacity: 0.2,
  },
})
