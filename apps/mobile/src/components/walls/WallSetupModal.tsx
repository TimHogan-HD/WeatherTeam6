import { useState, useEffect, useMemo } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  PanResponder,
  StyleSheet,
  Animated,
} from 'react-native'
// Angle slider constants — defined at module level so useMemo closures don't capture refs
const SLIDER_MIN = -30, SLIDER_MAX = 90, SLIDER_RANGE = SLIDER_MAX - SLIDER_MIN
function fromFraction(p: number) { return Math.round(SLIDER_MIN + p * SLIDER_RANGE) }
function toFraction(v: number) { return Math.max(0, Math.min(1, (v - SLIDER_MIN) / SLIDER_RANGE)) }
import { colors, type as t, spacing, radius, components } from '@weatherteam6/design/tokens'
import { SetupShell } from './SetupShell'
import { CompassDial } from './CompassDial'
import { CompassRose } from './CompassRose'
import { AngleProfile } from './AngleProfile'
import { useAddWall } from '../../hooks/useAddWall'
import { aspectToDegrees } from '@weatherteam6/types'
import type { Location } from '@weatherteam6/types'

type AspectPickerMode = 'terrain' | 'dial' | 'rose'
type AngleBand = 'slab' | 'vertical' | 'steep' | 'roof'

type SetupState = {
  step: 1 | 2 | 3 | 4
  wallName: string
  aspectDeg: number
  aspectSource: 'terrain' | 'manual'
  aspectPickerMode: AspectPickerMode
  angleDeg: number
  angleBand: AngleBand
}

type Props = {
  visible: boolean
  location: Location
  onClose: () => void
}

const ANGLE_BANDS: { band: AngleBand; label: string; sublabel: string; min: number; max: number }[] = [
  { band: 'slab', label: 'Slab', sublabel: '<0°', min: -30, max: -1 },
  { band: 'vertical', label: 'Vert', sublabel: '0°', min: 0, max: 9 },
  { band: 'steep', label: 'Steep', sublabel: '10–30°', min: 10, max: 30 },
  { band: 'roof', label: 'Roof', sublabel: '30°+', min: 31, max: 90 },
]

function angleToBand(deg: number): AngleBand {
  if (deg < 0) return 'slab'
  if (deg <= 9) return 'vertical'
  if (deg <= 30) return 'steep'
  return 'roof'
}

function angleToName(deg: number): string {
  if (deg < -15) return 'Slab'
  if (deg < 0) return 'Gentle slab'
  if (deg === 0) return 'Vertical'
  if (deg <= 9) return 'Near-vertical'
  if (deg <= 20) return 'Overhanging'
  if (deg <= 30) return 'Steep'
  if (deg <= 50) return 'Very steep'
  if (deg <= 80) return 'Severely overhanging'
  return 'Deep roof · cave'
}

// Blinking cursor for text inputs
function BlinkCursor() {
  // useState lazy init avoids accessing .current during render (satisfies react-hooks/refs)
  const [opacity] = useState(() => new Animated.Value(1))
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start()
  }, [opacity])
  return <Animated.View style={[styles.cursor, { opacity }]} />
}

// Custom PanResponder-based slider for angle
function AngleSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // trackW in state so panHandlers can depend on it without refs during render
  const [trackW, setTrackW] = useState(0)

  const panHandlers = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const pct = Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackW))
        onChange(fromFraction(pct))
      },
      onPanResponderMove: (evt) => {
        const pct = Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackW))
        onChange(fromFraction(pct))
      },
    }).panHandlers
  }, [onChange, trackW])

  const pct = toFraction(value)
  const handleLeft = trackW > 0 ? pct * trackW - 11 : 0

  return (
    <View style={sliderStyles.container} {...panHandlers}>
      <View
        style={sliderStyles.track}
        onLayout={(e) => {
          setTrackW(e.nativeEvent.layout.width)
        }}
      >
        <View style={[sliderStyles.handle, { left: handleLeft }]} />
      </View>
      <View style={sliderStyles.ticks}>
        {ANGLE_BANDS.map(b => (
          <Text key={b.band} style={sliderStyles.tick}>{b.label}</Text>
        ))}
      </View>
    </View>
  )
}

const sliderStyles = StyleSheet.create({
  container: { marginTop: 18, paddingHorizontal: 11 },
  track: {
    height: 6,
    borderRadius: 3,
    // Gradient approximated: blue→lime→amber→red left to right
    backgroundColor: 'rgba(99,179,237,0.4)',
    position: 'relative',
    overflow: 'visible',
  },
  handle: {
    position: 'absolute',
    top: '50%',
    marginTop: -11,
    marginLeft: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f0f4f8',
    borderWidth: 3,
    borderColor: '#0d1117',
  },
  ticks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  tick: {
    fontFamily: 'BarlowCondensed',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: colors.txt5,
  },
})

export function WallSetupModal({ visible, location, onClose }: Props) {
  const addWall = useAddWall()

  // Initial aspect from location if available
  const terrainAspect = location.aspect ? aspectToDegrees(location.aspect) : null
  const initialPickerMode: AspectPickerMode = terrainAspect !== null ? 'terrain' : 'dial'

  const [state, setState] = useState<SetupState>({
    step: 1,
    wallName: '',
    aspectDeg: terrainAspect ?? 180,
    aspectSource: terrainAspect !== null ? 'terrain' : 'manual',
    aspectPickerMode: initialPickerMode,
    angleDeg: 0,
    angleBand: 'vertical',
  })

  function update(partial: Partial<SetupState>) {
    setState(s => ({ ...s, ...partial }))
  }

  function goTo(step: 1 | 2 | 3 | 4) {
    update({ step })
  }

  function handleClose() {
    // Reset on close
    setState({
      step: 1,
      wallName: '',
      aspectDeg: terrainAspect ?? 180,
      aspectSource: terrainAspect !== null ? 'terrain' : 'manual',
      aspectPickerMode: initialPickerMode,
      angleDeg: 0,
      angleBand: 'vertical',
    })
    onClose()
  }

  async function handleAddWall() {
    await addWall.mutateAsync({
      locationId: location.id,
      name: state.wallName.trim(),
      aspectDeg: state.aspectDeg,
      aspectSource: state.aspectSource,
      angleDeg: state.angleDeg,
      angleBand: state.angleBand,
    })
    handleClose()
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      {state.step === 1 && (
        <SetupShell
          step={1} total={4}
          question="Name this wall"
          hint="Walls are sectors of a crag you track separately — each gets its own score, drying and sun window."
          onCancel={handleClose}
          onContinue={() => goTo(2)}
          continueDisabled={state.wallName.trim().length === 0}
        >
          {/* Crag field (read-only in Phase 8) */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Crag</Text>
            <View style={[styles.fieldInput, { justifyContent: 'space-between' }]}>
              <Text style={[styles.fieldValue, { color: colors.txt2 }]}>{location.name}</Text>
              <Text style={{ color: colors.txt4, fontSize: 16 }}>›</Text>
            </View>
          </View>

          {/* Wall name input */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Wall name</Text>
            <View style={styles.fieldInput}>
              <TextInput
                style={styles.nameInput}
                value={state.wallName}
                onChangeText={v => update({ wallName: v })}
                placeholder="e.g. West Buttress"
                placeholderTextColor={colors.txt4}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (state.wallName.trim()) goTo(2)
                }}
              />
              {state.wallName.length === 0 && <BlinkCursor />}
            </View>
          </View>
        </SetupShell>
      )}

      {state.step === 2 && state.aspectPickerMode === 'terrain' && (
        <SetupShell
          step={2} total={4}
          question={`We think it faces ${bearingToCardinal(terrainAspect!)}`}
          hint={`Derived from terrain near ${location.name}. Confirm or adjust.`}
          onCancel={handleClose}
          onContinue={() => {
            update({ aspectSource: 'terrain' })
            goTo(3)
          }}
          continueLabel="Looks right"
        >
          {/* Terrain suggestion card */}
          <View style={styles.suggestCard}>
            <View style={styles.sgMini} />
            <View style={styles.sgInfo}>
              <Text style={styles.sgLbl}>Terrain suggests</Text>
              <Text style={styles.sgDir}>{bearingToCardinal(terrainAspect!)} · {terrainAspect}°</Text>
              <Text style={styles.sgNote}>
                Based on the location&apos;s saved aspect direction. High confidence.
              </Text>
            </View>
          </View>
          <View style={styles.confirmRow}>
            <Pressable style={styles.btnGhost} onPress={() => update({ aspectPickerMode: 'dial' })}>
              <Text style={styles.btnGhostText}>Pick manually</Text>
            </Pressable>
          </View>
        </SetupShell>
      )}

      {state.step === 2 && state.aspectPickerMode === 'dial' && (
        <SetupShell
          step={2} total={4}
          question="Which way does it face?"
          hint="Drag the dial to point at the direction the wall faces. This drives sun exposure and drying."
          onCancel={handleClose}
          onContinue={() => {
            update({ aspectSource: 'manual' })
            goTo(3)
          }}
        >
          <CompassDial
            bearing={state.aspectDeg}
            onChange={deg => update({ aspectDeg: deg })}
          />
          {/* Toggle to rose */}
          <Pressable style={styles.modeToggle} onPress={() => update({ aspectPickerMode: 'rose' })}>
            <Text style={styles.modeToggleText}>Use compass rose instead</Text>
          </Pressable>
        </SetupShell>
      )}

      {state.step === 2 && state.aspectPickerMode === 'rose' && (
        <SetupShell
          step={2} total={4}
          question="Which way does it face?"
          hint="Tap the direction the wall faces. Eight-way is precise enough for sun and drying."
          onCancel={handleClose}
          onContinue={() => {
            update({ aspectSource: 'manual' })
            goTo(3)
          }}
        >
          <CompassRose
            active={degreesToCardinal8(state.aspectDeg)}
            onChange={(_dir, deg) => update({ aspectDeg: deg })}
          />
          {/* Toggle to dial */}
          <Pressable style={styles.modeToggle} onPress={() => update({ aspectPickerMode: 'dial' })}>
            <Text style={styles.modeToggleText}>Use compass dial instead</Text>
          </Pressable>
        </SetupShell>
      )}

      {state.step === 3 && (
        <SetupShell
          step={3} total={4}
          question="How steep is it?"
          hint="No public source has wall angle — you define it. It tunes how rain lands and how fast the face dries."
          onCancel={handleClose}
          onContinue={() => goTo(4)}
        >
          {/* Profile SVG */}
          <View style={styles.profileStage}>
            <AngleProfile angle={state.angleDeg} />
            <View style={styles.angleReadout}>
              <Text style={styles.arNum}>{Math.abs(state.angleDeg)}</Text>
              <Text style={styles.arDeg}>° past vertical</Text>
            </View>
            <Text style={styles.arName}>{angleToName(state.angleDeg)}</Text>
            <AngleSlider
              value={state.angleDeg}
              onChange={v => update({ angleDeg: v, angleBand: angleToBand(v) })}
            />
          </View>

          {/* Preset chips */}
          <View style={styles.presets}>
            {ANGLE_BANDS.map(b => (
              <Pressable
                key={b.band}
                style={[styles.preset, state.angleBand === b.band && styles.presetActive]}
                onPress={() => {
                  const deg = b.band === 'slab' ? -15
                    : b.band === 'vertical' ? 0
                    : b.band === 'steep' ? 18
                    : 45
                  update({ angleDeg: deg, angleBand: b.band })
                }}
              >
                <Text style={[styles.presetLabel, state.angleBand === b.band && styles.presetLabelActive]}>
                  {b.label}
                </Text>
                <Text style={styles.presetSublabel}>{b.sublabel}</Text>
              </Pressable>
            ))}
          </View>

          {/* Cave explanation when at roof end */}
          {state.angleDeg > 80 && (
            <View style={styles.suggestCard}>
              <Text style={{ color: colors.good, fontSize: 20 }}>💧</Text>
              <View style={styles.sgInfo}>
                <Text style={styles.sgLbl}>What a roof means</Text>
                <Text style={styles.sgNote}>
                  Rain barely touches the climbing surface — a deep roof stays dry through light precip and dries fastest of any angle.
                </Text>
              </View>
            </View>
          )}
        </SetupShell>
      )}

      {state.step === 4 && (
        <SetupShell
          step={4} total={4}
          question="Review"
          hint="You can edit any of this later from the wall's detail."
          onCancel={handleClose}
          onContinue={handleAddWall}
          continueLabel="Add wall"
          continueDisabled={addWall.isPending}
          footerOverride={
            <Pressable
              style={[components.btnPrimary, styles.footerBtn, addWall.isPending && { opacity: 0.5 }]}
              onPress={handleAddWall}
              disabled={addWall.isPending}
            >
              <Text style={components.btnPrimaryText}>
                {addWall.isPending ? 'Adding…' : '✓  Add wall'}
              </Text>
            </Pressable>
          }
        >
          <View style={styles.reviewCard}>
            <ReviewRow label="Wall" value={state.wallName} onEdit={() => goTo(1)} />
            <ReviewRow label="Crag" value={location.name} />
            <ReviewRow
              label="Aspect"
              sublabel={state.aspectSource === 'terrain' ? 'Terrain-derived · confirmed' : 'User-defined'}
              value={`${bearingToCardinal(state.aspectDeg)} · ${state.aspectDeg}°`}
              onEdit={() => goTo(2)}
            />
            <ReviewRow
              label="Angle"
              sublabel="User-defined"
              value={`${Math.abs(state.angleDeg)}° · ${angleToName(state.angleDeg)}`}
              onEdit={() => goTo(3)}
              isLast
            />
          </View>

          {/* First read */}
          <View style={[styles.suggestCard, { marginTop: 14 }]}>
            <Text style={{ color: colors.good, fontSize: 20 }}>☀️</Text>
            <View style={styles.sgInfo}>
              <Text style={styles.sgLbl}>First read</Text>
              <Text style={styles.sgNote}>
                A {bearingToCardinal(state.aspectDeg).toLowerCase()}-facing {angleToName(state.angleDeg).toLowerCase()} wall — score updates with the forecast once added.
              </Text>
            </View>
          </View>

          {addWall.isError && (
            <Text style={styles.errorText}>Failed to add wall. Please try again.</Text>
          )}
        </SetupShell>
      )}
    </Modal>
  )
}

function ReviewRow({
  label, sublabel, value, onEdit, isLast = false,
}: {
  label: string
  sublabel?: string
  value: string
  onEdit?: () => void
  isLast?: boolean
}) {
  return (
    <View style={[styles.rvRow, isLast && { borderBottomWidth: 0 }]}>
      <View>
        <Text style={styles.rvKey}>{label}</Text>
        {sublabel ? <Text style={styles.rvSource}>{sublabel}</Text> : null}
      </View>
      <View style={styles.rvRight}>
        <Text style={styles.rvValue}>{value}</Text>
        {onEdit && (
          <Pressable onPress={onEdit} hitSlop={8}>
            <Text style={styles.rvEdit}>✎</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

function bearingToCardinal(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(deg / 22.5) % 16]!
}

function degreesToCardinal8(deg: number): 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW' {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'] as const
  return dirs[Math.round(deg / 45) % 8]!
}

const styles = StyleSheet.create({
  field: { marginTop: 20 },
  fieldLabel: { ...t.label, color: colors.txt4 },
  fieldInput: {
    ...components.input,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  fieldValue: {
    fontFamily: 'BarlowCondensed',
    fontSize: 17,
    fontWeight: '600',
    color: colors.txt1,
    flex: 1,
  },
  nameInput: {
    fontFamily: 'BarlowCondensed',
    fontSize: 17,
    fontWeight: '600',
    color: colors.txt1,
    flex: 1,
    padding: 0,
  },
  cursor: {
    width: 2,
    height: 20,
    backgroundColor: colors.good,
  },
  suggestCard: {
    backgroundColor: 'rgba(184,245,66,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(184,245,66,0.24)',
    borderRadius: radius.cardLg,
    padding: spacing.cardPad,
    marginTop: 22,
    flexDirection: 'row',
    gap: 13,
    alignItems: 'flex-start',
  },
  sgMini: {
    width: 64,
    height: 64,
    borderRadius: 9,
    backgroundColor: colors.mapCanvas,
    borderWidth: 1,
    borderColor: colors.line,
    flexShrink: 0,
  },
  sgInfo: { flex: 1 },
  sgLbl: {
    fontFamily: 'BarlowCondensed',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.good,
  },
  sgDir: {
    fontFamily: 'BarlowCondensed',
    fontSize: 22,
    fontWeight: '700',
    color: colors.txt1,
    marginTop: 3,
  },
  sgNote: { ...t.bodySm, marginTop: 5 },
  confirmRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  btnGhost: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.chipMd,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnGhostText: {
    fontFamily: 'BarlowCondensed',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.txt3,
  },
  modeToggle: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  modeToggleText: {
    fontFamily: 'Barlow',
    fontSize: 12,
    color: colors.txt3,
    textDecorationLine: 'underline',
  },
  profileStage: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: spacing.cardPad,
    marginTop: 24,
  },
  angleReadout: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    justifyContent: 'center',
    marginTop: 14,
  },
  arNum: {
    fontFamily: 'BarlowCondensed',
    fontSize: 40,
    fontWeight: '700',
    color: colors.txt1,
    lineHeight: 40,
  },
  arDeg: {
    fontFamily: 'BarlowCondensed',
    fontSize: 18,
    color: colors.txt3,
    fontWeight: '600',
    marginBottom: 4,
  },
  arName: {
    fontFamily: 'BarlowCondensed',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.good,
    textAlign: 'center',
    marginTop: 2,
  },
  presets: {
    flexDirection: 'row',
    gap: spacing.chipGap,
    marginTop: 16,
  },
  preset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderRadius: radius.chipMd,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  presetActive: {
    backgroundColor: colors.goodTint,
    borderColor: colors.goodTintBorder,
  },
  presetLabel: {
    fontFamily: 'BarlowCondensed',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.txt2,
  },
  presetLabelActive: { color: colors.good },
  presetSublabel: { ...t.labelSm, color: colors.txt4, marginTop: 2 },
  reviewCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.cardLg,
    overflow: 'hidden',
    marginTop: 22,
  },
  rvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.cardPad,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rvKey: { ...t.label, color: colors.txt4 },
  rvSource: { fontFamily: 'Barlow', fontSize: 9, color: colors.txt5, marginTop: 2 },
  rvRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rvValue: {
    fontFamily: 'BarlowCondensed',
    fontSize: 15,
    fontWeight: '700',
    color: colors.txt1,
  },
  rvEdit: { color: colors.txt4, fontSize: 16 },
  errorText: {
    fontFamily: 'Barlow',
    fontSize: 12,
    color: colors.poor,
    textAlign: 'center',
    marginTop: 12,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
})
