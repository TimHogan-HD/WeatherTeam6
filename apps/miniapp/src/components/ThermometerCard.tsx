import { spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { sectionV2, stack } from '../theme/styles.js'
import { Sect } from './charts/liquid.js'
import { useAccount } from '../hooks/useAccount.js'
import { useSensors } from '../hooks/useSensors.js'
import { useNow } from '../hooks/useNow.js'
import { readingAge, readingFigures } from '../lib/sensors.js'
import { InlineError } from './States.js'

/**
 * Profile's thermometer card, for the owner alone (`GET /me`'s
 * `can_read_sensors`; the API refuses anyone else). Minimal on purpose (owner,
 * 2026-11-25): the readings are collected for data building, so this only
 * shows that collection is alive. Nothing here is a score or a crag reading.
 */
export function ThermometerCard() {
  const account = useAccount()
  if (account.data?.can_read_sensors !== true) return null
  return <Thermometer />
}

/** Split out so the 403-for-anyone-else query mounts only for the owner. */
function Thermometer() {
  const sensors = useSensors()
  const now = useNow()

  return (
    <section style={{ ...sectionV2, ...stack(spacing.listGapLg) }}>
      <div>
        <Sect title="Thermometer" />
        <p style={typeV2.note}>Stored every 30 minutes while it is online. Not used in any score.</p>
      </div>
      {sensors.isPending ? null : sensors.isError ? (
        <InlineError message="Couldn’t load the thermometer." onRetry={() => void sensors.refetch()} />
      ) : sensors.data.length === 0 ? (
        <p style={typeV2.body}>No readings yet.</p>
      ) : (
        <ul style={{ ...stack(spacing.listGapLg), listStyle: 'none', margin: 0, padding: 0 }}>
          {sensors.data.map((reading) => {
            const age = readingAge(reading.recorded_at, now)
            return (
              <li key={reading.device} style={stack(spacing.micro)}>
                {reading.device_name === null ? null : <span style={typeV2.note}>{reading.device_name}</span>}
                <span style={typeV2.body}>{readingFigures(reading)}</span>
                {age === null ? null : <span style={typeV2.note}>{age}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
