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

function cToF(c: number): number { return Math.round(c * 9 / 5 + 32) }
function kmhToMph(k: number): number { return Math.round(k * 0.621371) }

type Props = { locationId: string }

export function SevenDayTable({ locationId }: Props) {
  const { data } = useForecast(locationId)
  const [tab, setTab] = useState<Tab>('rain')

  const rows = (data ?? []).slice(0, 7)

  // Max values per tab for bar scaling
  const maxMm   = Math.max(1, ...rows.map((r) => r.precip_mm_p50 ?? 0))
  const maxTemp  = Math.max(1, ...rows.map((r) => r.temp_c_max ?? 0))
  const maxWind  = Math.max(1, ...rows.map((r) => r.wind_kmh_max ?? 0))
  const maxHumid = Math.max(1, ...rows.map((r) => r.humidity_pct ?? 0))

  function rowData(snap: (typeof rows)[0]) {
    const hi = snap.temp_c_max !== null ? cToF(snap.temp_c_max) : null
    const lo = snap.temp_c_min !== null ? cToF(snap.temp_c_min) : null
    switch (tab) {
      case 'rain': {
        const mm = snap.precip_mm_p50 ?? 0
        const inVal = (mm * 0.0393701).toFixed(2)
        return { barPct: mm / maxMm, barColor: colors.rain, right: `${inVal}"` }
      }
      case 'temp':
        return {
          barPct: (snap.temp_c_max ?? 0) / maxTemp,
          barColor: colors.sun,
          right: hi !== null && lo !== null ? `${hi}° / ${lo}°` : '—',
        }
      case 'wind': {
        const mph = snap.wind_kmh_max !== null ? kmhToMph(snap.wind_kmh_max) : null
        return {
          barPct: (snap.wind_kmh_max ?? 0) / maxWind,
          barColor: colors.txt2,
          right: mph !== null ? `${mph} mph` : '—',
        }
      }
      case 'humid': {
        const pct = snap.humidity_pct ?? 0
        return {
          barPct: pct / maxHumid,
          barColor: colors.rain,
          right: `${Math.round(pct)}%`,
        }
      }
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>7-Day</Text>
      {rows.map((snap, i) => {
        const { barPct, barColor, right } = rowData(snap)
        return (
          <View key={i} style={styles.row}>
            <Text style={styles.day}>{dayLabel(snap.forecast_date)}</Text>
            <View style={styles.barWrap}>
              <View style={[styles.bar, { width: `${Math.max(4, barPct * 100)}%` as DimensionValue, backgroundColor: barColor }]} />
            </View>
            <Text style={styles.hilo}>{right}</Text>
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
