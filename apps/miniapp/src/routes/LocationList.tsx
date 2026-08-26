import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { spacing } from '@weatherteam6/design/tokens'
import { type } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, chip, stack } from '../theme/styles.js'
import { useBackButton } from '../telegram/useBackButton.js'
import { useLocations } from '../hooks/useLocations.js'
import { Screen } from '../components/Screen.js'
import { LocationCard } from '../components/LocationCard.js'
import { EmptyState, InlineError, SkeletonCards } from '../components/States.js'
import { UpdatedAt } from '../components/UpdatedAt.js'

/**
 * `/` — the root. `BackButton` stays hidden; Telegram's own chrome closes the
 * app from here, and this app never calls `WebApp.close()` itself (§2).
 *
 * The add affordance in the title row is load-bearing, not decoration: it is
 * the only way a user who already has locations can reach `/add`. Without it
 * the add flow is reachable only from the empty state, which they will never
 * see again after saving their first location.
 */
export function LocationList() {
  const navigate = useNavigate()
  useBackButton(null)

  const locations = useLocations()
  const openLocation = useCallback((id: string) => void navigate(`/location/${id}`), [navigate])
  const openAdd = useCallback(() => void navigate('/add'), [navigate])

  return (
    <Screen
      title="Locations"
      action={
        <button type="button" style={{ ...bareButton, ...chip, ...type.labelSm, width: 'auto' }} onClick={openAdd}>
          Add
        </button>
      }
    >
      <div style={{ ...stack(spacing.listGap), marginTop: `${spacing.sectionTop}px` }}>
        {locations.isPending ? (
          <SkeletonCards count={3} height={120} />
        ) : locations.isError ? (
          <InlineError message="Couldn't load your locations." onRetry={() => void locations.refetch()} />
        ) : locations.data.length === 0 ? (
          <EmptyState
            title="No locations yet."
            action={
              <button type="button" style={{ ...bareButton, ...btnPrimary, ...btnPrimaryText, textAlign: 'center' }} onClick={openAdd}>
                Add a location
              </button>
            }
          />
        ) : (
          <>
            {locations.data.map((location) => (
              <LocationCard key={location.id} location={location} onOpen={openLocation} />
            ))}
            <UpdatedAt updatedAt={locations.dataUpdatedAt} />
          </>
        )}
      </div>
    </Screen>
  )
}
