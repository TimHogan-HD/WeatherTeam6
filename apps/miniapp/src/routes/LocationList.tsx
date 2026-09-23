import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { type } from '../theme/tokens.css.js'
import { colors, spacing } from '@weatherteam6/design/tokens'
import { bareButton, btnPrimary, btnPrimaryText, chip, stack } from '../theme/styles.js'
import { clearToken } from '../lib/authToken.js'
import { useLocations } from '../hooks/useLocations.js'
import { Screen } from '../components/Screen.js'
import { LocationCard } from '../components/LocationCard.js'
import { EmptyState, InlineError, SkeletonCards } from '../components/States.js'
import { UpdatedAt } from '../components/UpdatedAt.js'

/**
 * `/` — the root. No back affordance: there is nothing above this screen, and
 * a control that navigates to the screen already showing is the second-back-
 * affordance bug §2 describes with the destination wrong instead of the count.
 *
 * The add affordance in the title row is load-bearing, not decoration: it is
 * the only way a user who already has locations can reach `/add`. Without it
 * the add flow is reachable only from the empty state, which they will never
 * see again after saving their first location.
 */
export function LocationList() {
  const navigate = useNavigate()

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

      {/*
        Sign out. A login with no way out is the same trap as a save flow with
        no delete: the token lives in `localStorage`, so without this a shared
        or borrowed device stays signed in until the token expires, and there is
        no revocation to fall back on.

        It clears the token and nothing else. The redirect to `/login` and the
        cache clear both hang off the token store in `App.tsx`, so signing out
        and being signed out by a 401 take the same path — this button cannot
        drift away from the one the API triggers.
      */}
      <div style={{ marginTop: `${spacing.sectionGap}px` }}>
        <button
          type="button"
          style={{ ...bareButton, ...chip, ...type.labelSm, color: colors.txt3, textAlign: 'center' }}
          onClick={clearToken}
        >
          Sign out
        </button>
      </div>
    </Screen>
  )
}
