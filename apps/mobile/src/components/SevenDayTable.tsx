import type { DimensionValue } from 'react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useState } from 'react'
import { colors, radius, spacing, type as t } from '@weatherteam6/design/tokens'
import { useForecast } from '../hooks/useForecast'

type Tab = 'rain' | 'temp' | 'wind' | 'humid'

const DAY_ABBREV = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return DAY_ABBREV[d.getDay()] ?? dateStr
}

type Props = { locationId: string }

export function SevenDayTable({ locationId }: Props) {
  const { data } = useForecast(locationId)
  const [tab, setTab] = useState<Tab>('rain')

  const rows = (data ?? []).slice(0, 7)
  const maxMm = Math.max(1, ...rows.map((r) => r.precip_mm_p50 ?? 0))

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>7-Day</Text>
      {rows.map((snap, i) => {
        const mm = snap.precip_mm_p50 ?? 0
        const barPct = mm / maxMm
        const hi = snap.temp_c_max !== null ? Math.round(snap.temp_c_max * 9 / 5 + 32) : null
        const lo = snap.temp_c_min !== null ? Math.round(snap.temp_c_min * 9 / 5 + 32) : null
        return (
          <View key={i} style={styles.row}>
            <Text style={styles.day}>{dayLabel(snap.forecast_date)}</Text>
            <View style={styles.barWrap}>
              <View style={[styles.bar, { width: `${Math.max(4, barPct * 100)}%` as DimensionValue, opacity: 0.4 + barPct * 0.6 }]} />
            </View>
            <Text style={styles.hilo}>
              {hi !== null ? `${hi}°` : '—'} / {lo !== null ? `${lo}°` : '—'}
            </Text>
          </View>
        )
      })}
      <View style={styles.tabs}>
        {(['rain', 'temp', 'wind', 'humid'] as Tab[]).map((tb) => (
          <Pressable
            key={tb}
            style={[styles.tabBtn, tab === tb && styles.tabBtnActive]}
            onPress={() => setTab(tb)}
          >
            <Text style={[styles.tabLabel, tab === tb && styles.tabLabelActive]}>
              {tb.charAt(0).toUpperCase() + tb.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.screenH,
    marginBottom: spacing.sectionTop,
  },
  sectionTitle: {
    ...t.label,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 10,
  },
  day: {
    ...t.bodyMd,
    color: colors.txt2,
    width: 36,
    fontWeight: '600',
  },
  barWrap: {
    flex: 1,
    height: 6,
    backgroundColor: colors.line,
    borderRadius: 3,
    overflow: 'hidden',
  },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.rain,
  },
  hilo: {
    ...t.bodyMd,
    width: 72,
    textAlign: 'right',
    color: colors.txt2,
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  tabBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.chipMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(184,245,66,0.10)',
    borderColor: 'rgba(184,245,66,0.28)',
  },
  tabLabel: {
    ...t.labelSm,
    color: colors.txt3,
  },
  tabLabelActive: {
    color: colors.good,
  },
})
