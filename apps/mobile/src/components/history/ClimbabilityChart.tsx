import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { ClimbabilityHistory } from '@weatherteam6/types'
import { colors, fonts } from '@weatherteam6/design/tokens'

const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D']
const MAX_DAYS = 31
const BAR_MAX_HEIGHT = 72

interface Props {
  data: ClimbabilityHistory[]
}

export function ClimbabilityChart({ data }: Props) {
  const currentMonth = new Date().getMonth() + 1

  const byMonth = new Map(data.map((d) => [d.month, d]))

  return (
    <View style={styles.container}>
      <View style={styles.midLineWrap} pointerEvents="none">
        <View style={styles.midLine} />
      </View>
      <View style={styles.bars}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
          const entry = byMonth.get(month)
          const barHeight = entry
            ? Math.max(2, Math.round((entry.avg_climbable_days / MAX_DAYS) * BAR_MAX_HEIGHT))
            : 0
          const isCurrent = month === currentMonth
          return (
            <View key={month} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      backgroundColor: isCurrent
                        ? colors.good
                        : 'rgba(144,205,244,0.55)',
                    },
                  ]}
                />
              </View>
              <Text style={[styles.label, isCurrent && styles.labelActive]}>
                {MONTH_LABELS[month - 1]}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    height: BAR_MAX_HEIGHT + 20,
  },
  midLineWrap: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    height: BAR_MAX_HEIGHT,
    justifyContent: 'center',
  },
  midLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: BAR_MAX_HEIGHT / 2,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_MAX_HEIGHT,
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: '60%',
    height: BAR_MAX_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 2,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 4,
  },
  labelActive: {
    color: colors.good,
  },
})
