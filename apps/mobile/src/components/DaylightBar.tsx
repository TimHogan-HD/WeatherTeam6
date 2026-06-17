import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing, type as t } from '@weatherteam6/design/tokens'
import { getDaylight } from '../lib/daylight'

type Props = {
  lat: number
  lon: number
}

export function DaylightBar({ lat, lon }: Props) {
  const { info, pct } = useMemo(() => {
    const now = Date.now()
    const d = getDaylight(lat, lon, new Date(now))
    const elapsed = Math.max(0, now - d.sunrise.getTime())
    const total = Math.max(1, d.sunset.getTime() - d.sunrise.getTime())
    return { info: d, pct: Math.min(1, elapsed / total) }
  }, [lat, lon])

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{info.sunriseLabel}</Text>
        <View style={styles.trackWrap}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct * 100}%` }]} />
            <View style={[styles.nowMarker, { left: `${pct * 100}%` as unknown as number }]} />
          </View>
        </View>
        <Text style={styles.label}>{info.sunsetLabel}</Text>
      </View>
      <Text style={styles.remaining}>
        {info.daylightRemaining > 0
          ? `${info.daylightRemaining.toFixed(1)}h remaining`
          : 'Sun has set'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.screenH,
    marginBottom: spacing.sectionTop,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    ...t.bodySm,
    color: colors.txt3,
    width: 60,
  },
  trackWrap: {
    flex: 1,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'visible',
    position: 'relative',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.sun,
  },
  nowMarker: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.sun,
    marginLeft: -6,
  },
  remaining: {
    ...t.bodySm,
    marginTop: 6,
    textAlign: 'right',
    color: colors.txt3,
  },
})
