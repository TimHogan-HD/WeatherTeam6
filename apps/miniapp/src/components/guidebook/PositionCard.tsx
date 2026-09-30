import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { POSITION_ACCURACY_MAX_M, type GuidebookWall } from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { cardV2, row, stack } from '../../theme/styles.js'
import { formatAccuracyFt, formatInstantDate, mapsHref } from '../../lib/logbook.js'
import { useRecordPosition } from '../../hooks/useLogbook.js'
import { useCurrentPosition, type Fix } from '../../hooks/useCurrentPosition.js'
import { InlineError } from '../States.js'
import { PrimaryButton, pillButton } from './LogbookCard.js'

/**
 * Where this wall or boulder actually is, recorded from a phone standing at it
 * and shared by every account. **OpenBeta's `lat`/`lon` never appear here**:
 * they are inherited from parent areas and wrong on the ground.
 *
 * A reading is shown before it is sent, because saving replaces the position
 * everyone else sees.
 */

export function PositionCard({ wall }: { wall: GuidebookWall }) {
  // An API older than this client sends no field at all: a gap, not "never recorded".
  const position = wall.position ?? null
  const { reading, locate, cancel: stopLocating } = useCurrentPosition()
  const record = useRecordPosition()

  const cancel = () => {
    stopLocating()
    record.reset()
  }

  const save = (fix: Fix) => {
    record.mutate({ areaId: wall.id, fix }, { onSuccess: stopLocating })
  }

  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <h2 style={typeV2.cardTitle}>Location</h2>

      {position === null ? (
        <span style={{ ...typeV2.factValue, color: colorsV2.txtMuted }}>Not recorded</span>
      ) : (
        <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span style={{ ...typeV2.factValue, color: colorsV2.txt1 }}>
            Recorded {formatInstantDate(position.recorded_at)} · {formatAccuracyFt(position.accuracy_m)}
          </span>
          <a
            href={mapsHref(position.lat, position.lon)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...typeV2.cardLink, textDecoration: 'none' }}
          >
            Open in Maps ›
          </a>
        </div>
      )}

      {reading.kind === 'idle' ? (
        <div style={row(spacing.listGap)}>
          <button type="button" onClick={() => locate()} style={pillButton}>
            {position === null ? 'Record here' : 'Re-record'}
          </button>
        </div>
      ) : reading.kind === 'locating' ? (
        <div style={{ ...row(spacing.listGap), justifyContent: 'space-between' }}>
          <span role="status" style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
            Reading location…
          </span>
          <button type="button" onClick={cancel} style={pillButton}>Cancel</button>
        </div>
      ) : reading.kind === 'failed' ? (
        <div style={stack(spacing.listGap)}>
          <span role="status" style={{ ...typeV2.note, color: colorsV2.txt1 }}>{reading.message}</span>
          <div style={row(spacing.listGap)}>
            <button type="button" onClick={() => locate()} style={pillButton}>Try again</button>
            <button type="button" onClick={cancel} style={pillButton}>Cancel</button>
          </div>
        </div>
      ) : reading.fix.accuracy_m > POSITION_ACCURACY_MAX_M ? (
        <div style={stack(spacing.listGap)}>
          <span role="status" style={{ ...typeV2.note, color: colorsV2.txt1 }}>
            Fix: {formatAccuracyFt(reading.fix.accuracy_m)} · too rough to record. Needs{' '}
            {formatAccuracyFt(POSITION_ACCURACY_MAX_M)} or better.
          </span>
          <div style={row(spacing.listGap)}>
            <button type="button" onClick={() => locate()} style={pillButton}>Try again</button>
            <button type="button" onClick={cancel} style={pillButton}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={stack(spacing.listGap)}>
          <span role="status" style={{ ...typeV2.note, color: colorsV2.txt1 }}>
            Fix: {formatAccuracyFt(reading.fix.accuracy_m)} · replaces the position every account sees
          </span>
          {record.isError ? <InlineError message="Couldn't save the position." /> : null}
          <div style={row(spacing.listGap)}>
            <PrimaryButton disabled={record.isPending} onClick={() => save(reading.fix)}>
              {record.isPending ? 'Saving…' : 'Save'}
            </PrimaryButton>
            <button type="button" onClick={cancel} style={pillButton}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}
