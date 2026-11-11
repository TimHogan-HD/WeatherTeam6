import { useState, type ReactNode } from 'react'
import { useLocation as useRouterLocation } from 'react-router-dom'
import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { CLIMB_HOURS_DEFAULT, TEMP_RANGE_DEFAULT_F, hourLabel, type Preferences, type SetupPreviewDay } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, bottomClearance, brandButton, cardV2, choicePill, row, stack } from '../theme/styles.js'
import { scoreColor } from '../components/charts/chartStyle.js'
import { RangeSlider } from '../components/RangeSlider.js'
import { InlineError, Skeleton } from '../components/States.js'
import { detailTabs } from '../components/DetailView.js'
import { useNavigate } from '../hooks/useNavigate.js'
import { usePreferences, useUpdatePreferences } from '../hooks/usePreferences.js'
import { useSetupPreview } from '../hooks/useSetupPreview.js'
import { DEFAULT_DRAFT, draftFromPreferences, isDefault, type SettingsDraft } from '../lib/preferencesForm.js'
import {
  SCORE_LEGEND,
  TEMP_TRACK_F,
  WELCOME_SKIP,
  dayLine,
  dayReason,
  inHours,
  setHighF,
  setHour,
  setLowF,
  versusDefault,
  weekday,
  welcomeSave,
} from '../lib/welcome.js'

/** Router state Profile's "Run setup again" sends, so Save and Skip return there. */
export type WelcomeState = { from: 'profile' }

const fromProfile = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && (state as { from?: unknown }).from === 'profile'

/**
 * **`/welcome` — the first-open welcome screen** (#543, owner 2026-11-10;
 * mockup `docs/handoffs/design-mockups/welcome-screen.html`). Every account
 * sees it once, until it is saved or skipped (`App.tsx`'s gate), and Profile
 * can open it again. Everything it saves is an existing preference; the
 * example week is a demo and saves nothing.
 *
 * Units are left out (owner, 2026-11-10): nothing reads `temp_unit` or
 * `precip_unit`, so a °C choice would save and change nothing.
 */
export function Welcome() {
  const prefs = usePreferences()
  return (
    <main style={{ ...stack(spacing.tabGap), padding: `${spacing.topWeb}px ${spacing.screenH}px`, paddingBottom: bottomClearance }}>
      {prefs.isPending ? (
        <Skeleton height={spacing.sectionGap * 24} />
      ) : prefs.isError ? (
        <InlineError message="Couldn’t load your settings." onRetry={() => void prefs.refetch()} />
      ) : (
        <WelcomeForm saved={prefs.data} />
      )}
    </main>
  )
}

function WelcomeForm({ saved }: { saved: Preferences }) {
  const navigate = useNavigate()
  const { state } = useRouterLocation()
  const update = useUpdatePreferences()
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFromPreferences(saved))
  const [chosen, setChosen] = useState(2)
  const preview = useSetupPreview(draft)

  // From Profile, back to it (one entry, not two). From the gate, replace, so
  // back from the crags does not return to a screen already done.
  const leave = () => (fromProfile(state) ? navigate(-1) : navigate('/', { replace: true }))
  const skip = () => update.mutate(WELCOME_SKIP, { onSuccess: leave })
  const save = () => update.mutate(welcomeSave(saved, draft), { onSuccess: leave })
  const busy = update.isPending

  let standalone: boolean
  try {
    standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    standalone = false
  }

  return (
    <>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'center', minHeight: '44px' }}>
        <span style={{ ...typeV2.eyebrow, color: colorsV2.brandInk }}>Welcome</span>
        <button type="button" disabled={busy} onClick={skip} style={{ ...bareButton, ...typeV2.dayPick, width: 'auto', minHeight: '44px', color: colorsV2.txtMuted }}>
          Skip
        </button>
      </div>

      <div style={stack(spacing.tight)}>
        <h1 style={{ ...typeV2.screenTitle, color: colorsV2.txt1 }}>Welcome to WeatherTeam6</h1>
        <p style={{ ...typeV2.lead, color: colorsV2.txt2 }}>
          A few settings before you start. The score depends on them, so they’re worth a minute. You can change any of this later on Profile.
        </p>
      </div>

      <Section title="Reading the score">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: `${spacing.chipGapMd}px` }}>
          {SCORE_LEGEND.map((chip) => (
            <div
              key={chip.note}
              style={{
                ...row(spacing.chipGap),
                justifyContent: 'center',
                alignItems: 'baseline',
                padding: `${spacing.chipGapMd}px ${spacing.tight}px`,
                borderRadius: `${radius.rowV2}px`,
                backgroundColor: colorsV2.surface,
              }}
            >
              <b style={{ ...typeV2.listName, color: chip.tone === 'none' ? colorsV2.txtMuted : colors[chip.tone] }}>{chip.figure}</b>
              <small style={{ ...typeV2.legendSm, color: colorsV2.txtMuted, whiteSpace: 'nowrap' }}>{chip.note}</small>
            </div>
          ))}
        </div>
        <Facts
          items={[
            '0 to 100: how dry the rock is and how good the grip is likely to be.',
            'A day’s score is its best 3 hours in a row inside your climbing hours.',
            '— means forecast data is missing. The app leaves a gap rather than guess.',
            'Weather warnings show beside the score and never change it.',
          ]}
        />
      </Section>

      <Section title="Climbing preferences" sub="Your climbing hours and temperature range set every score. Change them and watch the example week.">
        <RangeSlider
          label="Climbing hours"
          valueText={`${hourLabel(draft.firstHour)} to ${hourLabel(draft.lastHour)}`}
          min={0}
          max={23}
          low={draft.firstHour}
          high={draft.lastHour}
          onLow={(h) => setDraft(setHour(draft, 'first', h))}
          onHigh={(h) => setDraft(setHour(draft, 'last', h))}
          lowName="Start of climbing hours"
          highName="End of climbing hours"
          format={hourLabel}
          ends={[hourLabel(0), hourLabel(23)]}
        />
        <RangeSlider
          label="Temperature range"
          valueText={`${draft.lowF}°F to ${draft.highF}°F`}
          min={TEMP_TRACK_F.min}
          max={TEMP_TRACK_F.max}
          low={draft.lowF}
          high={draft.highF}
          onLow={(f) => setDraft(setLowF(draft, f))}
          onHigh={(f) => setDraft(setHighF(draft, f))}
          lowName="Too cold below"
          highName="Too hot above"
          format={(f) => `${f}°F`}
          ends={[`${TEMP_TRACK_F.min}°`, `${TEMP_TRACK_F.max}°`]}
        />
        <button
          type="button"
          disabled={isDefault({ ...draft, tab: 'overview' })}
          onClick={() => setDraft({ ...DEFAULT_DRAFT, tab: draft.tab })}
          style={{ ...bareButton, ...typeV2.body, width: 'auto', alignSelf: 'flex-start', minHeight: '36px', color: colorsV2.brandInk }}
        >
          Back to the defaults ({TEMP_RANGE_DEFAULT_F.low}°F to {TEMP_RANGE_DEFAULT_F.high}°F, {hourLabel(CLIMB_HOURS_DEFAULT.first)} to{' '}
          {hourLabel(CLIMB_HOURS_DEFAULT.last)})
        </button>
        <ExampleWeek preview={preview} draft={draft} chosen={chosen} onChoose={setChosen} />
      </Section>

      <Section title="Open a crag on" sub="The tab you see first when you tap a crag.">
        <div role="group" aria-label="Tab a crag opens on" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: `${spacing.chipGapMd}px` }}>
          {detailTabs(true).map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={draft.tab === t.value}
              onClick={() => setDraft({ ...draft, tab: t.value })}
              style={{ ...choicePill(draft.tab === t.value), ...typeV2.dayPick, width: '100%', textAlign: 'center' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Feedback" aside={<span aria-hidden="true" style={feedbackLook}>Feedback</span>}>
        <p style={{ ...typeV2.body, color: colorsV2.txt2 }}>
          It’s in the top-right of every screen and comes straight to the person who runs the app. Use it for bugs, ideas, or a score that didn’t match the
          rock. From a crag, it opens with that crag chosen.
        </p>
      </Section>

      {standalone ? null : (
        <Section title="Add to home screen" sub="Opens like an app and keeps you signed in.">
          <Facts items={['iPhone: Safari › Share › Add to Home Screen', 'Android: Chrome › ⋮ › Add to Home screen']} />
        </Section>
      )}

      {update.isError ? <InlineError message="Couldn’t save. Check your connection and try again." /> : null}
      <div style={stack(spacing.tight)}>
        <button type="button" disabled={busy} onClick={save} style={{ ...brandButton, width: '100%', minHeight: '50px', opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Saving…' : isDefault(draft) ? 'Keep the defaults and start' : 'Save and start'}
        </button>
        <button type="button" disabled={busy} onClick={skip} style={{ ...bareButton, ...typeV2.lead, minHeight: '44px', textAlign: 'center', color: colorsV2.txt2 }}>
          Skip for now
        </button>
      </div>
    </>
  )
}

/** The Feedback button's look, inert, so the reader knows what to look for. Same tokens as `FeedbackButton`. */
const feedbackLook = {
  ...typeV2.controlValue,
  color: colors.good,
  border: `1px solid ${colors.good}`,
  borderRadius: `${radius.full}px`,
  padding: `${spacing.tight}px ${spacing.cardPadSm}px`,
  flexShrink: 0,
}

function Section({ title, sub, aside, children }: { title: string; sub?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section style={stack(spacing.listGap)}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={stack(spacing.micro)}>
          <h2 style={{ ...typeV2.dayName, color: colorsV2.txt1 }}>{title}</h2>
          {sub === undefined ? null : <p style={{ ...typeV2.controlLabel, color: colorsV2.txt2 }}>{sub}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Facts({ items }: { items: readonly string[] }) {
  return (
    <ul style={{ ...stack(spacing.tight), margin: 0, paddingLeft: `${spacing.listGapLg + spacing.chipGapMd}px` }}>
      {items.map((t) => (
        <li key={t} style={{ ...typeV2.controlLabel, color: colorsV2.txt2 }}>
          {t}
        </li>
      ))}
    </ul>
  )
}

/** The figure for a score, or a dash; coloured on the ladder only when there is a number. */
function scoreInk(score: number | null): string {
  return score === null ? colorsV2.txtMuted : scoreColor(score)
}

/**
 * The example crag and its sample week, rescoring as the sliders move. **While
 * an answer for this draft is not in, every figure is a gap** (defect class 7):
 * the last draft's numbers under the new hours would be a wrong reading.
 */
function ExampleWeek({
  preview,
  draft,
  chosen,
  onChoose,
}: {
  preview: ReturnType<typeof useSetupPreview>
  draft: SettingsDraft
  chosen: number
  onChoose: (i: number) => void
}) {
  const days: (SetupPreviewDay | null)[] = preview.data?.days ?? Array.from({ length: 5 }, () => null)
  const day = days[chosen] ?? null
  const names = preview.data?.days.map((d) => weekday(d.date)) ?? ['Thu', 'Fri', 'Sat', 'Sun', 'Mon']
  return (
    <div style={{ ...cardV2, ...stack(spacing.cellPad), padding: `${spacing.cardPadSm}px` }} aria-busy={preview.data === null}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...typeV2.cardName, color: colorsV2.txt1 }}>{preview.data?.crag_name ?? 'Red Wing'}</span>
        <span style={{ ...typeV2.eyebrow, color: colorsV2.txtMuted }}>Example · sample week</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: `${spacing.chipGap}px` }}>
        {days.map((d, i) => {
          const vs = d === null ? null : versusDefault(d)
          const score = d?.score ?? null
          return (
            <button
              key={names[i]}
              type="button"
              aria-pressed={i === chosen}
              aria-label={d === null ? `${names[i]}: loading` : `${names[i]}: ${score ?? 'no score'}${vs === null ? '' : `, default ${d.default_score ?? 'no score'}`}`}
              onClick={() => onChoose(i)}
              style={{
                ...bareButton,
                ...stack(spacing.micro),
                alignItems: 'center',
                minHeight: '76px',
                padding: `${spacing.chipGapMd}px ${spacing.micro}px`,
                borderRadius: `${radius.dayTile}px`,
                backgroundColor: i === chosen ? choicePill(true).backgroundColor : colorsV2.surface,
                boxShadow: i === chosen ? `inset 0 0 0 1.5px ${colorsV2.brandInk}` : 'none',
              }}
            >
              <span style={{ ...typeV2.kicker, color: colorsV2.txt2 }}>{names[i]}</span>
              <b style={{ ...typeV2.statFigure, color: d === null ? colorsV2.txtMuted : scoreInk(score) }}>{d === null ? '…' : (score ?? '—')}</b>
              <small style={{ ...typeV2.statLabel, minHeight: '13px', color: vs === null ? 'inherit' : vs.up ? colors.good : colors.poor }}>{vs?.arrow ?? ''}</small>
            </button>
          )
        })}
      </div>
      <div style={{ ...stack(spacing.chipGap), paddingTop: `${spacing.listGap}px`, borderTop: `1px solid ${colorsV2.line}` }}>
        {preview.isError ? (
          <InlineError message="Couldn’t score the example week." onRetry={preview.retry} />
        ) : day === null ? (
          <p style={{ ...typeV2.body, color: colorsV2.txtMuted }}>Scoring the example week…</p>
        ) : (
          <>
            <p role="status" style={{ ...typeV2.body, color: colorsV2.txt1 }}>
              {dayLine(day)}
            </p>
            <p style={{ ...typeV2.controlLabel, color: colorsV2.txt2 }}>{dayReason(day, draft)}</p>
          </>
        )}
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: `${spacing.micro}px`, marginTop: `${spacing.tight}px` }}>
          {Array.from({ length: 24 }, (_, h) => {
            const hour = day?.hours.find((x) => x.hour === h) ?? null
            return (
              <i
                key={h}
                style={{
                  display: 'block',
                  height: '18px',
                  borderRadius: `${radius.tag}px`,
                  backgroundColor: hour === null || hour.score === null ? colorsV2.line : scoreColor(hour.score),
                  opacity: inHours(h, draft) ? 1 : 0.22,
                }}
              />
            )
          })}
        </div>
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', ...typeV2.axisTick, color: colorsV2.txtMuted }}>
          <span>12a</span>
          <span>6a</span>
          <span>12p</span>
          <span>6p</span>
        </div>
      </div>
    </div>
  )
}
