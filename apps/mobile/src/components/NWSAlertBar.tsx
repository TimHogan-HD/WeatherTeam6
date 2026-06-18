import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, type as t } from '@weatherteam6/design/tokens'
import { useAlerts } from '../hooks/useAlerts'

type Props = { locationId: string }

export function NWSAlertBar({ locationId }: Props) {
  const { data: alerts } = useAlerts(locationId)

  if (!alerts || alerts.length === 0) return null

  const alert = alerts[0]!

  return (
    <View style={styles.bar}>
      <Text style={styles.icon}>⚠</Text>
      <View style={styles.text}>
        <Text style={styles.event}>{alert.event}</Text>
        {alert.expires ? (
          <Text style={styles.expires}>Until {new Date(alert.expires).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: spacing.screenH,
    marginBottom: spacing.sectionTop,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.inlineGap,
    backgroundColor: 'rgba(252,129,129,0.12)',
    borderWidth: 1,
    borderColor: colors.poor,
    borderRadius: radius.card,
    padding: spacing.cardPadSm,
  },
  icon: {
    fontSize: 16,
    color: colors.poor,
  },
  text: {
    flex: 1,
  },
  event: {
    ...t.bodyMd,
    color: colors.poor,
    fontWeight: '600',
  },
  expires: {
    ...t.bodySm,
    color: colors.txt3,
  },
})
