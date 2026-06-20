import React from 'react'
import { Text, StyleSheet } from 'react-native'
import type { ClimbabilityHistory } from '@weatherteam6/types'
import { colors, fonts } from '@weatherteam6/design/tokens'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  data: ClimbabilityHistory[]
}

export function BestMonthsCallout({ data }: Props) {
  if (data.length === 0) return null

  const top3 = [...data]
    .sort((a, b) => b.avg_climbable_days - a.avg_climbable_days)
    .slice(0, 3)
    .sort((a, b) => a.month - b.month)
    .map((d) => MONTH_LABELS[d.month - 1])

  return (
    <Text style={styles.callout}>
      Best months: {top3.join(' · ')}
    </Text>
  )
}

const styles = StyleSheet.create({
  callout: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.good,
    marginBottom: 10,
  },
})
