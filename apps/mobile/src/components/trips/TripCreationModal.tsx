import { useState, useMemo } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native'
import Svg, { Path, Rect, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg'
import { colors, fonts } from '@weatherteam6/design/tokens'
import { SetupShell } from '../walls/SetupShell'
import type { CreateTripInput } from '@weatherteam6/types'

// ─── confidence helpers ──────────────────────────────────────────────────────

function confidenceLevel(daysOut: number): { pct: number; label: 'High' | 'Medium' | 'Low' } {
  if (daysOut <= 7) return { pct: 85, label: 'High' }
  if (daysOut <= 14) return { pct: 55, label: 'Medium' }
  return { pct: 25, label: 'Low' }
}

function confidenceColor(label: 'High' | 'Medium' | 'Low'): string {
  if (label === 'High') return colors.good
  if (label === 'Medium') return colors.fair
  return colors.txt4
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function diffDays(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// ─── mock crag list (real search is Phase 10) ───────────────────────────────

const MOCK_CRAGS = [
  { id: 'a1b2c3d4-0000-0000-0000-000000000001', name: 'Joshua Tree', meta: 'Granite · CA', score: 88, tone: 'good' },
  { id: 'a1b2c3d4-0000-0000-0000-000000000002', name: 'Red Rock', meta: 'Limestone · NV', score: 74, tone: 'good' },
  { id: 'a1b2c3d4-0000-0000-0000-000000000003', name: 'Indian Creek', meta: 'Sandstone · UT', score: 61, tone: 'fair' },
  { id: 'a1b2c3d4-0000-0000-0000-000000000004', name: 'Yosemite', meta: 'Granite · CA', score: null, tone: 'unknown' },
]

// ─── ConfCalendar ─────────────────────────────────────────────────────────────

type CalProps = {
  today: string
  startDate: string | null
  endDate: string | null
  onSelectStart: (d: string) => void
  onSelectEnd: (d: string) => void
}

function ConfCalendar({ today, startDate, endDate, onSelectStart, onSelectEnd }: CalProps) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(today + 'T12:00:00')
    d.setDate(1)
    return d
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  function cellDate(d: number): string {
    return isoDate(new Date(year, month, d))
  }

  function conf(d: number): 'high' | 'med' | 'low' {
    const daysOut = diffDays(cellDate(d), today)
    if (daysOut <= 7) return 'high'
    if (daysOut <= 14) return 'med'
    return 'low'
  }

  function handlePress(d: number): void {
    const iso = cellDate(d)
    if (!startDate || (startDate && endDate)) {
      onSelectStart(iso)
      onSelectEnd('')
    } else {
      if (iso < startDate) {
        onSelectStart(iso)
      } else {
        onSelectEnd(iso)
      }
    }
  }

  const todayIso = today

  function prevMonth() {
    setViewDate(prev => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() - 1)
      return d
    })
  }
  function nextMonth() {
    setViewDate(prev => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() + 1)
      return d
    })
  }

  const blanks = Array.from({ length: firstDow })

  return (
    <View style={cal.root}>
      {/* header */}
      <View style={cal.head}>
        <Text style={cal.monthLabel}>{monthLabel}</Text>
        <View style={cal.navRow}>
          <Pressable style={cal.navBtn} onPress={prevMonth} hitSlop={8}>
            <Text style={cal.navText}>‹</Text>
          </Pressable>
          <Pressable style={cal.navBtn} onPress={nextMonth} hitSlop={8}>
            <Text style={cal.navText}>›</Text>
          </Pressable>
        </View>
      </View>

      {/* day-of-week header */}
      <View style={cal.dowRow}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={cal.dow}>{d}</Text>
        ))}
      </View>

      {/* grid */}
      <View style={cal.grid}>
        {blanks.map((_, i) => <View key={'b' + i} style={cal.cell} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
          const iso = cellDate(d)
          const tier = conf(d)
          const isStart = iso === startDate
          const isEnd = iso === endDate
          const inRange =
            startDate && endDate && iso >= startDate && iso <= endDate
          const isToday = iso === todayIso

          return (
            <Pressable
              key={d}
              style={[
                cal.cell,
                tier === 'high' && cal.cHigh,
                inRange && !isStart && !isEnd && cal.inRange,
                isStart && cal.rangeStart,
                isEnd && cal.rangeEnd,
              ]}
              onPress={() => handlePress(d)}
            >
              <Text
                style={[
                  cal.cellNum,
                  (isStart || isEnd) && cal.cellNumSelected,
                  isToday && !isStart && !isEnd && { color: colors.good },
                ]}
              >
                {d}
              </Text>
              <View
                style={[
                  cal.dot,
                  tier === 'high' && cal.dotHigh,
                  tier === 'med' && cal.dotMed,
                  tier === 'low' && cal.dotLow,
                  (isStart || isEnd) && cal.dotSelected,
                ]}
              />
            </Pressable>
          )
        })}
      </View>

      {/* legend */}
      <View style={cal.legend}>
        <View style={cal.legItem}>
          <View style={[cal.legDot, { backgroundColor: colors.good }]} />
          <Text style={cal.legLabel}>Reliable</Text>
        </View>
        <View style={cal.legItem}>
          <View style={[cal.legDot, { backgroundColor: colors.fair }]} />
          <Text style={cal.legLabel}>Trending</Text>
        </View>
        <View style={cal.legItem}>
          <View style={[cal.legDot, { backgroundColor: 'rgba(226,232,240,0.30)' }]} />
          <Text style={cal.legLabel}>Averages only</Text>
        </View>
      </View>
    </View>
  )
}

// ─── HorizonRamp SVG ──────────────────────────────────────────────────────────

type RampProps = {
  selStart: number
  selEnd: number
}

function HorizonRamp({ selStart, selEnd }: RampProps) {
  const W = 300
  const H = 96
  const pad = 4

  const xx = (t: number) => pad + t * (W - pad * 2)
  const confVal = (t: number) => 0.3 + 0.62 * Math.exp(-3.2 * t)
  const yy = (v: number) => H - 16 - v * (H - 26)

  const N = 40
  let lineParts = `M ${xx(0)} ${yy(confVal(0))}`
  for (let i = 1; i <= N; i++) {
    const t2 = i / N
    lineParts += ` L ${xx(t2)} ${yy(confVal(t2))}`
  }
  const area = lineParts + ` L ${xx(1)} ${H - 4} L ${xx(0)} ${H - 4} Z`

  const midT = (selStart + selEnd) / 2

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="confFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="rgba(184,245,66,0.45)" />
          <Stop offset="100%" stopColor="rgba(184,245,66,0.02)" />
        </LinearGradient>
        <LinearGradient id="confLine" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="rgba(184,245,66,0.95)" />
          <Stop offset="55%" stopColor="rgba(246,173,85,0.9)" />
          <Stop offset="100%" stopColor="rgba(226,232,240,0.4)" />
        </LinearGradient>
      </Defs>
      <Rect
        x={xx(selStart)}
        y={2}
        width={xx(selEnd) - xx(selStart)}
        height={H - 6}
        fill="rgba(184,245,66,0.12)"
        rx={2}
      />
      <Line
        x1={xx(selStart)} y1={2} x2={xx(selStart)} y2={H - 4}
        stroke="rgba(184,245,66,0.5)" strokeWidth={1}
      />
      <Line
        x1={xx(selEnd)} y1={2} x2={xx(selEnd)} y2={H - 4}
        stroke="rgba(184,245,66,0.5)" strokeWidth={1}
      />
      <Path d={area} fill="url(#confFill)" />
      <Path d={lineParts} fill="none" stroke="url(#confLine)" strokeWidth={2.5} />
      <Circle
        cx={xx(midT)}
        cy={yy(confVal(midT))}
        r={4}
        fill="#b8f542"
        stroke="#0d1117"
        strokeWidth={2}
      />
    </Svg>
  )
}

// ─── Step 1: Where ────────────────────────────────────────────────────────────

type StepWhereProps = {
  selected: string[]
  onToggle: (id: string) => void
  onCancel: () => void
  onContinue: () => void
}

function StepWhere({ selected, onToggle, onCancel, onContinue }: StepWhereProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(
    () =>
      MOCK_CRAGS.filter(c =>
        query.trim() === '' || c.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  )

  const selectedCrags = MOCK_CRAGS.filter(c => selected.includes(c.id))

  return (
    <SetupShell
      step={1}
      total={4}
      question="Where to?"
      hint="Pick one or more crags. Each keeps its own forecast and score across the trip dates."
      onCancel={onCancel}
      onContinue={onContinue}
      continueDisabled={selected.length === 0}
    >
      {/* Search bar */}
      <View style={s.searchBar}>
        <Text style={s.searchIcon}>⌕</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search crags"
          placeholderTextColor={colors.txt4}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {/* Chosen chips */}
      {selectedCrags.length > 0 && (
        <View style={s.chipsRow}>
          {selectedCrags.map(c => (
            <Pressable key={c.id} style={s.chip} onPress={() => onToggle(c.id)}>
              <Text style={s.chipText}>{c.name}</Text>
              <Text style={s.chipX}>✕</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={s.sectionLabel}>Nearby crags</Text>

      {/* Crag list */}
      {filtered.map(c => {
        const isSel = selected.includes(c.id)
        return (
          <Pressable
            key={c.id}
            style={[s.cragOpt, isSel && s.cragOptSel]}
            onPress={() => onToggle(c.id)}
          >
            <View style={s.scorePill}>
              <Text
                style={[
                  s.scoreText,
                  c.tone === 'good' && { color: colors.good },
                  c.tone === 'fair' && { color: colors.fair },
                  c.tone === 'unknown' && { color: colors.txt4 },
                ]}
              >
                {c.score ?? '?'}
              </Text>
            </View>
            <View style={s.cragInfo}>
              <Text style={s.cragName}>{c.name}</Text>
              <Text style={s.cragMeta}>{c.meta}</Text>
            </View>
            <View style={[s.checkCircle, isSel && s.checkCircleSel]}>
              {isSel && <Text style={s.checkMark}>✓</Text>}
            </View>
          </Pressable>
        )
      })}
    </SetupShell>
  )
}

// ─── Step 2: When ─────────────────────────────────────────────────────────────

type StepWhenProps = {
  today: string
  startDate: string
  endDate: string
  onStartDate: (d: string) => void
  onEndDate: (d: string) => void
  onCancel: () => void
  onContinue: () => void
}

function StepWhen({
  today,
  startDate,
  endDate,
  onStartDate,
  onEndDate,
  onCancel,
  onContinue,
}: StepWhenProps) {
  const [mode, setMode] = useState<'calendar' | 'horizon'>('calendar')

  const hasDates = !!startDate && !!endDate

  // Weekend windows for horizon ramp
  const weekendWindows = useMemo(() => {
    const wins: { label: string; meta: string; startIso: string; endIso: string }[] = []
    const d = new Date(today + 'T12:00:00')
    for (let i = 0; i < 28 && wins.length < 3; i++) {
      const dow = d.getDay()
      if (dow === 5) {
        const fri = isoDate(d)
        const sun = isoDate(addDays(d, 2))
        const daysOut = diffDays(fri, today)
        wins.push({
          label: `${formatDate(fri)} – ${formatDate(sun)}`,
          meta: `${daysOut} days out · Fri–Sun`,
          startIso: fri,
          endIso: sun,
        })
      }
      d.setDate(d.getDate() + 1)
    }
    return wins
  }, [today])

  // Map date range to 0-1 on the 21-day horizon
  const selStart = startDate
    ? Math.min(Math.max(diffDays(startDate, today) / 21, 0), 1)
    : 0.3
  const selEnd = endDate
    ? Math.min(Math.max(diffDays(endDate, today) / 21, 0), 1)
    : 0.5

  return (
    <SetupShell
      step={2}
      total={4}
      question="When?"
      hint={
        mode === 'calendar'
          ? 'Days are shaded by how reliable the forecast is now. Confidence climbs as your trip nears.'
          : 'The line is how confident the forecast is over the next three weeks — it decays the further out you plan.'
      }
      onCancel={onCancel}
      onContinue={onContinue}
      continueDisabled={!hasDates}
    >
      {/* Toggle */}
      <View style={s.modeToggle}>
        <Pressable
          style={[s.modeBtn, mode === 'calendar' && s.modeBtnActive]}
          onPress={() => setMode('calendar')}
        >
          <Text style={[s.modeBtnText, mode === 'calendar' && s.modeBtnTextActive]}>Calendar</Text>
        </Pressable>
        <Pressable
          style={[s.modeBtn, mode === 'horizon' && s.modeBtnActive]}
          onPress={() => setMode('horizon')}
        >
          <Text style={[s.modeBtnText, mode === 'horizon' && s.modeBtnTextActive]}>Horizon</Text>
        </Pressable>
      </View>

      {mode === 'calendar' && (
        <ConfCalendar
          today={today}
          startDate={startDate || null}
          endDate={endDate || null}
          onSelectStart={onStartDate}
          onSelectEnd={onEndDate}
        />
      )}

      {mode === 'horizon' && (
        <View>
          <View style={s.horizonWrap}>
            <HorizonRamp selStart={selStart} selEnd={selEnd} />
            <View style={s.horizonScale}>
              {['TODAY', '+7d', '+14d', '+21d'].map(l => (
                <Text key={l} style={s.scaleLabel}>{l}</Text>
              ))}
            </View>
          </View>

          <Text style={[s.sectionLabel, { marginTop: 22 }]}>Weekend windows</Text>
          {weekendWindows.map(w => {
            const dOut = diffDays(w.startIso, today)
            const conf = confidenceLevel(dOut)
            const isSel = w.startIso === startDate
            return (
              <Pressable
                key={w.startIso}
                style={[s.hzWin, isSel && s.hzWinSel]}
                onPress={() => { onStartDate(w.startIso); onEndDate(w.endIso) }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.hzDates}>{w.label}</Text>
                  <Text style={s.hzMeta}>{w.meta}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.hzConf, { color: confidenceColor(conf.label) }]}>{conf.label}</Text>
                  <Text style={s.hzConfK}>Confidence</Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      )}
    </SetupShell>
  )
}

// ─── Step 3: Name ─────────────────────────────────────────────────────────────

type StepNameProps = {
  name: string
  onName: (v: string) => void
  selectedCragIds: string[]
  startDate: string
  endDate: string
  today: string
  onCancel: () => void
  onContinue: () => void
}

function StepName({
  name,
  onName,
  selectedCragIds,
  startDate,
  endDate,
  today,
  onCancel,
  onContinue,
}: StepNameProps) {
  const cragCount = selectedCragIds.length
  const dateLabel = startDate && endDate ? `${formatDate(startDate)}–${formatDate(endDate)}` : ''
  const daysOut = startDate ? Math.max(diffDays(startDate, today), 0) : 0

  return (
    <SetupShell
      step={3}
      total={4}
      question="Name this trip"
      hint="Optional — we'll default to the dates if you skip it."
      onCancel={onCancel}
      onContinue={onContinue}
      continueLabel="Continue"
    >
      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>Trip name</Text>
        <TextInput
          style={s.fieldInput}
          value={name}
          onChangeText={onName}
          placeholder="e.g. Father's Day Weekend"
          placeholderTextColor={colors.txt4}
          selectionColor={colors.good}
        />
      </View>

      <View style={s.summaryWrap}>
        <Text style={s.sectionLabel}>So far</Text>
        <Text style={s.summaryMeta}>
          {cragCount} {cragCount === 1 ? 'crag' : 'crags'}
          {dateLabel ? ` · ${dateLabel}` : ''}
          {daysOut > 0 ? ` · ${daysOut} days out` : ''}
        </Text>
        <View style={s.chipsRow}>
          <View style={s.summaryChip}>
            <Text style={s.summaryChipText}>📍 {cragCount} {cragCount === 1 ? 'crag' : 'crags'}</Text>
          </View>
          {dateLabel ? (
            <View style={s.summaryChip}>
              <Text style={s.summaryChipText}>📅 {dateLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </SetupShell>
  )
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

type StepReviewProps = {
  name: string
  selectedCragIds: string[]
  startDate: string
  endDate: string
  today: string
  onCancel: () => void
  onCreate: () => void
  isCreating: boolean
}

function StepReview({
  name,
  selectedCragIds,
  startDate,
  endDate,
  today,
  onCancel,
  onCreate,
  isCreating,
}: StepReviewProps) {
  const crags = MOCK_CRAGS.filter(c => selectedCragIds.includes(c.id))
  const cragLabel = crags.map(c => c.name).join(' + ')
  const daysOut = startDate ? Math.max(diffDays(startDate, today), 0) : 0
  const conf = confidenceLevel(daysOut)
  const confColor = confidenceColor(conf.label)

  const tripName = name.trim() || (startDate && endDate ? `${formatDate(startDate)}–${formatDate(endDate)}` : 'Trip')
  const checkBackDate = startDate ? formatDate(isoDate(addDays(new Date(startDate + 'T12:00:00'), -7))) : ''

  const avail = [
    { key: 'NWS point forecast', val: `Hourly through 7 days`, on: daysOut <= 7 },
    { key: 'HRRR / ensemble', val: 'Available within 48 h of trip', on: daysOut <= 2 },
    { key: 'Climatology', val: '30-yr ACIS averages', on: true },
  ]

  const footer = (
    <Pressable
      style={[s.createBtn, isCreating && { opacity: 0.5 }]}
      onPress={onCreate}
      disabled={isCreating}
    >
      <Text style={s.createBtnText}>{isCreating ? 'Creating…' : '✓  Create trip'}</Text>
    </Pressable>
  )

  return (
    <SetupShell
      step={4}
      total={4}
      question="Review"
      hint=""
      onCancel={onCancel}
      onContinue={onCreate}
      footerOverride={footer}
    >
      {/* Trip summary */}
      <View style={s.tripSummary}>
        <Text style={s.tripName}>{tripName}</Text>
        <Text style={s.tripMeta}>
          {cragLabel}
          {startDate && endDate ? ` · ${formatDate(startDate)} – ${formatDate(endDate)}` : ''}
          {daysOut > 0 ? ` · ${daysOut} days out` : ''}
        </Text>
      </View>

      {/* Confidence hero */}
      <View style={[s.confHero, { borderColor: confColor + '38' }]}>
        <View style={s.confHeroTop}>
          <Text style={[s.confPct, { color: confColor }]}>{conf.pct}%</Text>
          <Text style={s.confLevel}>
            {conf.label} · {daysOut} days out
          </Text>
        </View>
        <View style={s.confTrack}>
          <View style={[s.confFill, { width: `${conf.pct}%` as unknown as number, backgroundColor: confColor }]} />
        </View>
        <Text style={s.confNote}>
          {conf.label === 'High'
            ? 'Models are in strong agreement. Confidence is high for the trip window.'
            : conf.label === 'Medium'
              ? 'Models broadly agree, but it\'s early — the signal firms up inside a week.'
              : 'Too far out for reliable models — confidence is based on climatological averages.'}
        </Text>
        {conf.label !== 'High' && checkBackDate && (
          <View style={s.confRebuild}>
            <Text style={s.confRebuildText}>↑  Check back {checkBackDate} — confidence should reach High.</Text>
          </View>
        )}
      </View>

      <Text style={s.sectionLabel}>Data feeding this trip</Text>
      {avail.map(a => (
        <View key={a.key} style={s.availRow}>
          <View style={[s.availIcon, a.on ? s.availIconOn : s.availIconOff]}>
            <Text style={[s.availIconText, { color: a.on ? colors.good : colors.txt4 }]}>
              {a.on ? '✓' : '⏱'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.availKey}>{a.key}</Text>
            <Text style={s.availVal}>{a.val}</Text>
          </View>
          <Text style={[s.availStat, { color: a.on ? colors.good : colors.txt4 }]}>
            {a.on ? (a.key === 'Climatology' ? 'Now' : 'Live') : 'Soon'}
          </Text>
        </View>
      ))}
    </SetupShell>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

type Props = {
  visible: boolean
  onClose: () => void
  onCreated: () => void
  onCreateTrip: (input: CreateTripInput) => Promise<void>
}

export function TripCreationModal({ visible, onClose, onCreated, onCreateTrip }: Props) {
  const today = useMemo(() => isoDate(new Date()), [])

  const [step, setStep] = useState(1)
  const [selectedCragIds, setSelectedCragIds] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  function reset() {
    setStep(1)
    setSelectedCragIds([])
    setStartDate('')
    setEndDate('')
    setName('')
    setIsCreating(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function toggleCrag(id: string) {
    setSelectedCragIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }

  async function handleCreate() {
    if (isCreating) return
    setIsCreating(true)
    try {
      await onCreateTrip({
        name: name.trim() || `${formatDate(startDate)}–${formatDate(endDate)}`,
        startDate,
        endDate,
        cragIds: selectedCragIds,
      })
      reset()
      onCreated()
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      {step === 1 && (
        <StepWhere
          selected={selectedCragIds}
          onToggle={toggleCrag}
          onCancel={handleClose}
          onContinue={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <StepWhen
          today={today}
          startDate={startDate}
          endDate={endDate}
          onStartDate={setStartDate}
          onEndDate={setEndDate}
          onCancel={handleClose}
          onContinue={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <StepName
          name={name}
          onName={setName}
          selectedCragIds={selectedCragIds}
          startDate={startDate}
          endDate={endDate}
          today={today}
          onCancel={handleClose}
          onContinue={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <StepReview
          name={name}
          selectedCragIds={selectedCragIds}
          startDate={startDate}
          endDate={endDate}
          today={today}
          onCancel={handleClose}
          onCreate={handleCreate}
          isCreating={isCreating}
        />
      )}
    </Modal>
  )
}

// ─── Calendar styles ──────────────────────────────────────────────────────────

const CELL_SIZE = 44

const cal = StyleSheet.create({
  root: { marginTop: 18 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthLabel: {
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.34,
    color: colors.txt1,
  },
  navRow: { flexDirection: 'row', gap: 6 },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: { fontFamily: fonts.display, fontSize: 20, color: colors.txt3, lineHeight: 24 },
  dowRow: { flexDirection: 'row', marginTop: 14 },
  dow: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.txt4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 3 },
  cell: {
    width: (CELL_SIZE * 7 + 3 * 6) / 7,
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cHigh: { backgroundColor: 'rgba(184,245,66,0.08)' },
  inRange: { backgroundColor: 'rgba(184,245,66,0.14)', borderRadius: 0 },
  rangeStart: { backgroundColor: colors.good, borderRadius: 8 },
  rangeEnd: { backgroundColor: colors.good, borderRadius: 8 },
  cellNum: { fontFamily: fonts.display, fontSize: 14, fontWeight: '600', color: colors.txt2 },
  cellNumSelected: { color: colors.onGood },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  dotHigh: { backgroundColor: colors.good },
  dotMed: { backgroundColor: colors.fair },
  dotLow: { backgroundColor: 'rgba(226,232,240,0.30)' },
  dotSelected: { backgroundColor: colors.onGood },
  legend: { flexDirection: 'row', gap: 14, marginTop: 16, justifyContent: 'center' },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legDot: { width: 7, height: 7, borderRadius: 4 },
  legLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.txt3 },
})

// ─── Shared step styles ───────────────────────────────────────────────────────

const s = StyleSheet.create({
  searchBar: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  searchIcon: { fontSize: 18, color: colors.txt4 },
  searchInput: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '600',
    color: colors.txt1,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(184,245,66,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(184,245,66,0.28)',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600', color: colors.good },
  chipX: { fontFamily: fonts.body, fontSize: 11, color: colors.good, opacity: 0.7 },
  sectionLabel: {
    fontFamily: fonts.display,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.txt4,
    marginTop: 18,
  },
  cragOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    paddingHorizontal: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    marginTop: 6,
  },
  cragOptSel: {
    backgroundColor: 'rgba(184,245,66,0.08)',
    borderColor: 'rgba(184,245,66,0.30)',
  },
  scorePill: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scoreText: { fontFamily: fonts.display, fontSize: 16, fontWeight: '700' },
  cragInfo: { flex: 1, minWidth: 0 },
  cragName: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.48,
    color: colors.txt1,
  },
  cragMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.txt3, marginTop: 2 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkCircleSel: { backgroundColor: colors.good, borderColor: colors.good },
  checkMark: { fontSize: 13, color: colors.onGood, lineHeight: 16 },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 3,
    marginTop: 18,
  },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeBtnActive: { backgroundColor: colors.card2 },
  modeBtnText: { fontFamily: fonts.display, fontSize: 13, fontWeight: '600', color: colors.txt3 },
  modeBtnTextActive: { color: colors.txt1 },
  horizonWrap: { marginTop: 22 },
  horizonScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  scaleLabel: {
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: colors.txt5,
  },
  hzWin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    paddingHorizontal: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    marginTop: 6,
  },
  hzWinSel: {
    backgroundColor: 'rgba(184,245,66,0.08)',
    borderColor: 'rgba(184,245,66,0.30)',
  },
  hzDates: { fontFamily: fonts.display, fontSize: 15, fontWeight: '700', color: colors.txt1 },
  hzMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.txt3, marginTop: 2 },
  hzConf: { fontFamily: fonts.display, fontSize: 13, fontWeight: '700' },
  hzConfK: {
    fontFamily: fonts.display,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.txt4,
    marginTop: 2,
    textAlign: 'right',
  },
  fieldWrap: { marginTop: 18 },
  fieldLabel: {
    fontFamily: fonts.display,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.txt4,
    marginBottom: 8,
  },
  fieldInput: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '700',
    color: colors.txt1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  summaryWrap: { marginTop: 22 },
  summaryMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.txt3, marginTop: 8 },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryChipText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600', color: colors.txt2 },
  tripSummary: { marginTop: 4 },
  tripName: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '700',
    color: colors.txt1,
    lineHeight: 26,
  },
  tripMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.txt3, marginTop: 5 },
  confHero: {
    marginTop: 22,
    backgroundColor: 'rgba(184,245,66,0.06)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  confHeroTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  confPct: { fontFamily: fonts.display, fontSize: 40, fontWeight: '700', lineHeight: 42 },
  confLevel: {
    fontFamily: fonts.display,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.txt1,
  },
  confTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(226,232,240,0.10)',
    marginTop: 13,
    overflow: 'hidden',
  },
  confFill: { height: 6, borderRadius: 3 },
  confNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.txt2,
    lineHeight: 18,
    marginTop: 12,
  },
  confRebuild: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(184,245,66,0.16)',
  },
  confRebuildText: { fontFamily: fonts.body, fontSize: 11, color: colors.txt3 },
  availRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    paddingHorizontal: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    marginTop: 6,
  },
  availIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  availIconOn: { backgroundColor: 'rgba(184,245,66,0.12)' },
  availIconOff: { backgroundColor: 'rgba(226,232,240,0.05)' },
  availIconText: { fontSize: 14 },
  availKey: { fontFamily: fonts.display, fontSize: 13, fontWeight: '700', color: colors.txt1 },
  availVal: { fontFamily: fonts.body, fontSize: 10, color: colors.txt3, marginTop: 1 },
  availStat: {
    fontFamily: fonts.display,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  createBtn: {
    backgroundColor: colors.good,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.onGood,
  },
})
