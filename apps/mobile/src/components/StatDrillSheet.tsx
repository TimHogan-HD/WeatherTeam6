import { useEffect, useState } from 'react'
import type { DimensionValue } from 'react-native'
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors, radius, spacing, type as t } from '@weatherteam6/design/tokens'
import type { WeatherObservation } from '../types/weather'

type Props = {
  statType: string | null
  obs: WeatherObservation | null
  onDismiss: () => void
}

const MODELS = ['ASOS', 'GFS', 'ECMWF', 'HRRR', 'NBM', 'NAM'] as const

const TREND_PATH = 'M 0 32 L 80 28 L 160 20 L 240 24 L 320 18'

function mockModelValues(baseVal: number): Record<string, number> {
  return {
    ASOS: baseVal,
    GFS: baseVal * 1.04,
    ECMWF: baseVal * 0.97,
    HRRR: baseVal * 1.01,
    NBM: baseVal * 0.99,
    NAM: baseVal * 1.06,
  }
}

function getCurrentValue(statType: string, obs: WeatherObservation): { value: string; unit: string } {
  switch (statType) {
    case 'wind': return { value: String(obs.windSpeedMph), unit: 'mph' }
    case 'humidity': return { value: String(obs.humidityPct), unit: '%' }
    case 'pressure': return { value: obs.pressureInHg.toFixed(2), unit: 'inHg' }
    case 'visibility': return { value: String(obs.visibilityMiles), unit: 'mi' }
    case 'uv': return { value: String(obs.uvIndex), unit: 'UV' }
    case 'cloud': return { value: String(obs.cloudCoverPct), unit: '%' }
    case 'precip': return { value: obs.precip1hIn.toFixed(2), unit: '"' }
    default: return { value: '—', unit: '' }
  }
}

export function StatDrillSheet({ statType, obs, onDismiss }: Props) {
  const [slideAnim] = useState(() => new Animated.Value(300))

  useEffect(() => {
    if (statType !== null) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start()
    } else {
      slideAnim.setValue(300)
    }
  }, [statType, slideAnim])

  const current = obs && statType ? getCurrentValue(statType, obs) : null
  const modelVals = current && obs ? mockModelValues(parseFloat(current.value) || 0) : {}

  return (
    <Modal visible={statType !== null} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{statType ?? ''}</Text>
          <Pressable onPress={onDismiss} hitSlop={10}>
            <Text style={styles.dismiss}>Dismiss</Text>
          </Pressable>
        </View>

        {current ? (
          <>
            <Text style={styles.currentValue}>
              {current.value}<Text style={styles.unit}> {current.unit}</Text>
            </Text>
            <Text style={styles.source}>Observed · {obs?.stationId} ASOS · Now</Text>

            <Text style={styles.trendLabel}>24H Trend</Text>
            <Svg width="100%" height={44} viewBox="0 0 320 44">
              <Path d={TREND_PATH} stroke={colors.rain} strokeWidth={2} fill="none" />
            </Svg>

            <Text style={styles.modelLabel}>Model Comparison</Text>
            {MODELS.map((m) => {
              const val = modelVals[m] ?? 0
              const isObs = m === 'ASOS'
              const asos = modelVals['ASOS'] ?? 0
              const barPct = asos > 0 ? val / (asos * 1.5) : 0
              return (
                <View key={m} style={[styles.modelRow, isObs && styles.modelRowHighlight]}>
                  <Text style={[styles.modelName, isObs && styles.modelNameHighlight]}>{m}</Text>
                  <View style={styles.modelBarWrap}>
                    <View style={[styles.modelBar, { width: `${Math.min(100, barPct * 100)}%` as DimensionValue }]} />
                  </View>
                  <Text style={[styles.modelVal, isObs && styles.modelValHighlight]}>
                    {Number.isFinite(val) ? val.toFixed(1) : '—'}
                  </Text>
                </View>
              )
            })}
            {(() => {
              const modelOnly = MODELS.filter((m) => m !== 'ASOS').map((m) => modelVals[m] ?? 0)
              const observed = modelVals['ASOS'] ?? 0
              const low  = Math.min(...modelOnly)
              const high = Math.max(...modelOnly)
              const spread = high - low
              return (
                <View style={styles.spreadRow}>
                  {([
                    { label: 'Model Low',  val: low.toFixed(1) },
                    { label: 'Observed',   val: observed.toFixed(1) },
                    { label: 'Model High', val: high.toFixed(1) },
                    { label: 'Spread',     val: `±${(spread / 2).toFixed(1)}` },
                  ] as const).map(({ label, val }) => (
                    <View key={label} style={styles.spreadCell}>
                      <Text style={styles.spreadVal}>{val}</Text>
                      <Text style={styles.spreadLabel}>{label}</Text>
                    </View>
                  ))}
                </View>
              )
            })()}
          </>
        ) : null}
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a202c',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.screenH,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    ...t.navTitle,
    textTransform: 'capitalize',
  },
  dismiss: {
    ...t.bodyMd,
    color: colors.good,
    fontWeight: '600',
  },
  currentValue: {
    fontFamily: 'BarlowCondensed',
    fontSize: 36,
    fontWeight: '700',
    color: colors.txt1,
  },
  unit: {
    fontSize: 18,
    color: colors.txt3,
  },
  source: {
    ...t.bodySm,
    marginBottom: 12,
  },
  trendLabel: {
    ...t.label,
    marginBottom: 6,
  },
  modelLabel: {
    ...t.label,
    marginTop: 16,
    marginBottom: 6,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  modelRowHighlight: {
    backgroundColor: 'rgba(184,245,66,0.06)',
    borderRadius: radius.inner,
    paddingHorizontal: 4,
  },
  modelName: {
    ...t.labelSm,
    width: 44,
  },
  modelNameHighlight: {
    color: colors.good,
  },
  modelBarWrap: {
    flex: 1,
    height: 4,
    backgroundColor: colors.line,
    borderRadius: 2,
    overflow: 'hidden',
  },
  modelBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.rain,
  },
  modelVal: {
    ...t.bodySm,
    width: 36,
    textAlign: 'right',
  },
  modelValHighlight: {
    color: colors.good,
  },
  spreadRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  spreadCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  spreadVal: {
    fontFamily: 'BarlowCondensed',
    fontSize: 15,
    fontWeight: '700',
    color: colors.txt1,
  },
  spreadLabel: {
    ...t.labelSm,
    color: colors.txt4,
    textAlign: 'center',
  },
})
