import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { colors, radius, spacing, type as t } from '@weatherteam6/design/tokens'
import { useConditions } from '../hooks/useConditions'

type Props = { locationId: string; onPress?: () => void }

function scoreColor(score: number | null): string {
  if (score === null) return colors.txt3
  if (score >= 60) return colors.good
  if (score >= 40) return colors.fair
  return colors.poor
}

function scoreBg(score: number | null): string {
  if (score === null) return colors.card
  if (score >= 60) return 'rgba(184,245,66,0.12)'
  if (score >= 40) return 'rgba(246,173,85,0.12)'
  return 'rgba(252,129,129,0.12)'
}

export function WallsButton({ locationId, onPress }: Props) {
  const { data: conditions } = useConditions(locationId)

  function handlePress() {
    if (onPress) {
      onPress()
    } else {
      router.push(`/walls/${locationId}`)
    }
  }

  return (
    <Pressable style={styles.btn} onPress={handlePress}>
      <Text style={styles.icon}>⛰</Text>
      <View style={styles.info}>
        <Text style={styles.label}>Walls</Text>
        <Text style={styles.meta}>Tap to see conditions</Text>
      </View>
      {conditions?.score != null ? (
        <View style={[styles.pill, { backgroundColor: scoreBg(conditions.score) }]}>
          <Text style={[styles.pillScore, { color: scoreColor(conditions.score) }]}>
            {conditions.score}
          </Text>
        </View>
      ) : null}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    marginHorizontal: spacing.screenH,
    marginBottom: spacing.sectionTop,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.inlineGap,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: spacing.cardPad,
  },
  icon: {
    fontSize: 20,
  },
  info: {
    flex: 1,
  },
  label: {
    ...t.bodyMd,
    color: colors.txt1,
    fontWeight: '600',
  },
  meta: {
    ...t.bodySm,
  },
  pill: {
    borderRadius: radius.chipMd,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillScore: {
    fontFamily: 'BarlowCondensed',
    fontSize: 18,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 20,
    color: colors.txt3,
  },
})
