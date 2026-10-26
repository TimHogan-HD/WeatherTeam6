import { useState, type ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { CLIMB_HOURS_DEFAULT, TEMP_RANGE_DEFAULT_F, climbHoursLabel, type Preferences } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, brandButton, cardV2, choicePill, row, stack } from '../theme/styles.js'
import { Sect } from './charts/liquid.js'
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
import { ClimbHoursSteppers, Stepper } from './Stepper.js'
import { detailTabs } from './DetailView.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The Profile screen's settings (scoring Phase 5, owner decision 2026-10-01):
 * the temperature range friction is judged against, the hours a day's score
 * is read from (#401), and the tab a crag opens on. One Save for all, sending
 * only what changed.
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
        {(['low', 'high'] as const).map((end) => (
          <Stepper
            key={end}
            label={end === 'low' ? 'Low' : 'High'}
            value={`${end === 'low' ? draft.lowF : draft.highF}°F`}
            down={canStep(draft, end, -TEMP_STEP_F) ? stepRange(draft, end, -TEMP_STEP_F) : null}
            up={canStep(draft, end, TEMP_STEP_F) ? stepRange(draft, end, TEMP_STEP_F) : null}
            downName={`${end === 'low' ? 'Low' : 'High'} ${TEMP_STEP_F}° colder`}
            upName={`${end === 'low' ? 'Low' : 'High'} ${TEMP_STEP_F}° warmer`}
            onChange={change}
          />
        ))}
      </Card>

      <Card
        title="Climbing hours"
        note={`A day’s score comes from these hours only. Default ${climbHoursLabel(CLIMB_HOURS_DEFAULT)}.`}
      >
        <ClimbHoursSteppers
          hours={{ first: draft.firstHour, last: draft.lastHour }}
          onChange={(h) => change({ ...draft, firstHour: h.first, lastHour: h.last })}
        />
      </Card>

      <Card title="Open a crag on" note="The tab a crag shows first.">
        <div role="group" aria-label="Open a crag on" style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          {detailTabs(true).map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={draft.tab === t.value}
                onClick={() => change({ ...draft, tab: t.value })}
                style={{ ...choicePill(draft.tab === t.value), ...typeV2.dayPick }}
              >
                {t.label}
              </button>
            ))}
        </div>
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>Places that aren’t crags always open on Overview.</p>
      </Card>

      {update.isError ? <InlineError message="Couldn’t save. Check your connection and try again." /> : null}
      {done && changes === null ? (
        <p role="status" style={{ ...typeV2.body, color: colorsV2.goodInk }}>
          Saved.
        </p>
      ) : null}

      <div style={{ ...row(spacing.cellPad), alignItems: 'center' }}>
        <button
          type="button"
          style={{ ...brandButton, flex: 1, opacity: changes === null || update.isPending ? 0.5 : 1 }}
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
      <div>
        <Sect title={title} />
        <p style={typeV2.body}>{note}</p>
      </div>
      {children}
    </section>
  )
}
