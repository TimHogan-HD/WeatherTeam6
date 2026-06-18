import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, type as t } from '@weatherteam6/design/tokens'
import { useHourlyForecast } from '../hooks/useHourlyForecast'

type Props = { locationId: string }

export function HourlyStrip({ locationId }: Props) {
  const { data } = useHourlyForecast(locationId)

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Hourly</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {data.map((slot, i) => (
          <View key={i} style={styles.cell}>
            <Text style={styles.time}>{slot.time}</Text>
            <Text style={styles.temp}>{slot.tempF}°</Text>
            <Text style={styles.wind}>{slot.windDir} {slot.windSpeedMph}</Text>
            <Text style={styles.prob}>{slot.precipPct}%</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sectionTop,
  },
  sectionTitle: {
    ...t.label,
    paddingHorizontal: spacing.screenH,
    marginBottom: 8,
  },
  scroll: {
    paddingHorizontal: spacing.screenH,
    gap: spacing.listGapSm,
  },
  cell: {
    width: 72,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: spacing.cardPadSm,
    alignItems: 'center',
    gap: 3,
  },
  time: {
    ...t.labelSm,
    color: colors.txt4,
  },
  temp: {
    fontFamily: 'BarlowCondensed',
    fontSize: 20,
    fontWeight: '700',
    color: colors.txt1,
  },
  wind: {
    ...t.bodySm,
  },
  prob: {
    ...t.bodySm,
    color: colors.rain,
  },
})
