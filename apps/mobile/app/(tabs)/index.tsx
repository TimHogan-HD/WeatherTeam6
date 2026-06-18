import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, spacing, type as t } from '@weatherteam6/design/tokens'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentLocation } from '../../src/hooks/useCurrentLocation'
import { useWeatherObservations } from '../../src/hooks/useWeatherObservations'
import { TopBar } from '../../src/components/TopBar'
import { StatGrid } from '../../src/components/StatGrid'
import { DaylightBar } from '../../src/components/DaylightBar'
import { EnsemblePrecipChart } from '../../src/components/EnsemblePrecipChart'
import { HourlyStrip } from '../../src/components/HourlyStrip'
import { NWSAlertBar } from '../../src/components/NWSAlertBar'

function HeroSection({
  tempF,
  condition,
  feelsLikeF,
  dewPointF,
  todayHighF,
  todayLowF,
}: {
  tempF: number
  condition: string
  feelsLikeF: number
  dewPointF: number
  todayHighF: number
  todayLowF: number
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroTemp}>{tempF}°</Text>
      <Text style={styles.heroCondition}>{condition}</Text>
      <Text style={styles.heroMeta}>
        Feels like {feelsLikeF}°  ·  Dew {dewPointF}°
      </Text>
      <Text style={styles.heroMeta}>
        H:{todayHighF}°  L:{todayLowF}°
      </Text>
    </View>
  )
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No Location</Text>
      <Text style={styles.emptyBody}>Add a location to see weather data.</Text>
    </View>
  )
}

export default function HomeScreen() {
  const qc = useQueryClient()
  const locationQ = useCurrentLocation()
  const location = locationQ.data

  const obsQ = useWeatherObservations(location?.id)
  const obs = obsQ.data

  const isRefreshing = locationQ.isFetching ?? false

  function onRefresh() {
    if (!location) return
    qc.invalidateQueries({ queryKey: ['observations', location.id] })
    qc.invalidateQueries({ queryKey: ['forecast', location.id] })
    qc.invalidateQueries({ queryKey: ['alerts', location.id] })
  }

  return (
    <LinearGradient
      colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.good} />}
          showsVerticalScrollIndicator={false}
        >
          <TopBar
            title={location?.name ?? 'Weather'}
            subtitle={location ? `${obs?.stationId ?? ''} · Updated ${obs?.updatedMinutesAgo ?? 0} min ago` : undefined}
          />

          {!location || !obs ? (
            <EmptyState />
          ) : (
            <>
              <HeroSection
                tempF={obs.tempF}
                condition={obs.condition}
                feelsLikeF={obs.feelsLikeF}
                dewPointF={obs.dewPointF}
                todayHighF={obs.todayHighF}
                todayLowF={obs.todayLowF}
              />
              <StatGrid variant="home" obs={obs} />
              <DaylightBar lat={location.lat} lon={location.lon} />
              <EnsemblePrecipChart locationId={location.id} />
              <HourlyStrip locationId={location.id} />
              <NWSAlertBar locationId={location.id} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  hero: {
    paddingHorizontal: spacing.screenH,
    paddingVertical: spacing.sectionTop,
    marginBottom: spacing.sectionTop,
    alignItems: 'center',
  },
  heroTemp: {
    fontFamily: 'BarlowCondensed',
    fontSize: 80,
    fontWeight: '700',
    color: colors.txt1,
    lineHeight: 80,
  },
  heroCondition: {
    ...t.screenSub,
    fontSize: 18,
    marginTop: 4,
    color: colors.txt2,
  },
  heroMeta: {
    ...t.bodyMd,
    marginTop: 4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyTitle: {
    ...t.screenTitle,
    marginBottom: 8,
  },
  emptyBody: {
    ...t.bodyMd,
    textAlign: 'center',
  },
})
