import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, type as t } from '@weatherteam6/design/tokens'

type Props = {
  label: string
  value: string
  detail?: string
  showBar?: boolean
  barPct?: number
  onLongPress?: () => void
  flex?: number
}

export function StatTile({ label, value, detail, showBar, barPct = 0, onLongPress, flex = 1 }: Props) {
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      style={[styles.tile, { flex }]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {showBar ? (
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, barPct * 100))}%` }]} />
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: spacing.cardPadSm,
    minHeight: 72,
    justifyContent: 'flex-start',
  },
  label: {
    ...t.label,
    marginBottom: 4,
  },
  value: {
    fontFamily: 'BarlowCondensed',
    fontSize: 22,
    fontWeight: '700',
    color: colors.txt1,
    lineHeight: 24,
  },
  detail: {
    ...t.bodySm,
    marginTop: 2,
  },
  barTrack: {
    marginTop: 6,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  barFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.rain,
  },
})
