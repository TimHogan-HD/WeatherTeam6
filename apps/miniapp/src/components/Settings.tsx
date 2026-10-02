import { useState, type ReactNode } from 'react'
import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { TEMP_RANGE_DEFAULT_F, type Preferences } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, cardV2, chip, chipActive, row, stack } from '../theme/styles.js'
import { usePreferences, useUpdatePreferences } from '../hooks/usePreferences.js'
import {
  DEFAULT_DRAFT,
  TEMP_STEP_F,
  canStep,
  draftFromPreferences,
  isDefault,
  settingsUpdate,
  stepRange,
  type SettingsDraft,
} from '../lib/preferencesForm.js'
import { detailTabs } from './DetailView.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The Profile screen's settings (scoring Phase 5, owner decision 2026-10-01):
 * the temperature range friction is judged against, and the tab a crag opens
 * on. One Save for both, sending only what changed.
 */
export function Settings() {
  const prefs = usePreferences()
  if (prefs.isPending) return <Skeleton height={spacing.sectionGap * 16} />
  if (prefs.isError) {
    return <InlineError message="Couldn't load your settings." onRetry={() => void prefs.refetch()} />
  }
  return <SettingsForm saved={prefs.data} />
}

function SettingsForm({ saved }: { saved: Preferences }) {
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFromPreferences(saved))
  const [done, setDone] = useState(false)
  const update = useUpdatePreferences()
  const changes = settingsUpdate(saved, draft)

  const change = (next: SettingsDraft) => {
    setDraft(next)
    setDone(false)
  }

  return (
    <>
      <Card
        title="Temperature range"
        note={`The score drops when it’s colder or warmer than this. Default ${TEMP_RANGE_DEFAULT_F.low}–${TEMP_RANGE_DEFAULT_F.high}°F.`}
      >
        <Stepper label="Low" end="low" draft={draft} onChange={change} />
        <Stepper label="High" end="high" draft={draft} onChange={change} />
      </Card>

      <Card title="Open a crag on" note="The tab a crag shows first.">
        <div role="group" aria-label="Open a crag on" style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          {detailTabs(true).map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={draft.tab === t.value}
                onClick={() => change({ ...draft, tab: t.value })}
                style={{
                  ...bareButton,
                  ...(draft.tab === t.value ? chipActive : chip),
                  ...typeV2.chip,
                  color: draft.tab === t.value ? colors.good : colorsV2.txt1,
                  width: 'auto',
                }}
              >
                {t.label}
              </button>
            ))}
        </div>
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>Places that aren’t crags always open on Overview.</p>
      </Card>

      {update.isError ? <InlineError message="Couldn’t save. Check your connection and try again." /> : null}
      {done && changes === null ? (
        <p role="status" style={{ ...typeV2.note, color: colors.good }}>
          Saved.
        </p>
      ) : null}

      <div style={{ ...row(spacing.cellPad), alignItems: 'center' }}>
        <button
          type="button"
          style={{
            ...bareButton,
            ...btnPrimary,
            ...btnPrimaryText,
            textAlign: 'center',
            flex: 1,
            opacity: changes === null || update.isPending ? 0.5 : 1,
          }}
          disabled={changes === null || update.isPending}
          onClick={() => {
            if (changes !== null) update.mutate(changes, { onSuccess: () => setDone(true) })
          }}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          disabled={isDefault(draft)}
          onClick={() => change(DEFAULT_DRAFT)}
          style={{
            ...bareButton,
            ...typeV2.cardLink,
            width: 'auto',
            padding: `${spacing.listGap}px`,
            opacity: isDefault(draft) ? 0.5 : 1,
          }}
        >
          Reset
        </button>
      </div>
    </>
  )
}

function Card({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <div style={stack(spacing.micro)}>
        <h2 style={typeV2.cardTitle}>{title}</h2>
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>{note}</p>
      </div>
      {children}
    </section>
  )
}

/** − value + for one end of the range, in steps of `TEMP_STEP_F`. */
function Stepper({
  label,
  end,
  draft,
  onChange,
}: {
  label: string
  end: 'low' | 'high'
  draft: SettingsDraft
  onChange: (d: SettingsDraft) => void
}) {
  const value = end === 'low' ? draft.lowF : draft.highF
  const button = (delta: number, glyph: string, name: string) => {
    const enabled = canStep(draft, end, delta)
    return (
      <button
        type="button"
        aria-label={name}
        disabled={!enabled}
        onClick={() => onChange(stepRange(draft, end, delta))}
        style={{
          ...bareButton,
          ...chip,
          ...typeV2.controlValue,
          color: colorsV2.txt1,
          width: `${spacing.sectionGap * 2.75}px`,
          height: `${spacing.sectionGap * 2.75}px`,
          padding: 0,
          borderRadius: `${radius.full}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: enabled ? 1 : 0.4,
        }}
      >
        {glyph}
      </button>
    )
  }
  return (
    <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ ...typeV2.gaugeLabel, color: colorsV2.txtMuted }}>{label}</span>
      <div style={{ ...row(spacing.listGapLg), alignItems: 'center' }}>
        {button(-TEMP_STEP_F, '−', `${label} ${TEMP_STEP_F}° colder`)}
        <span aria-live="polite" style={{ ...typeV2.bandValue, color: colorsV2.txt1, minWidth: `${spacing.sectionGap * 3}px`, textAlign: 'center' }}>
          {value}°F
        </span>
        {button(TEMP_STEP_F, '+', `${label} ${TEMP_STEP_F}° warmer`)}
      </div>
    </div>
  )
}
