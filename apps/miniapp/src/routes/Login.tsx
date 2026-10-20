import { useCallback, useState, type FormEvent } from 'react'
import { useNavigate } from '../hooks/useNavigate.js'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { brandButton, cardV2, fieldV2, stack } from '../theme/styles.js'
import { apiLogin, ApiError } from '../lib/api.js'
import { setToken } from '../lib/authToken.js'
import { Screen } from '../components/Screen.js'

/**
 * `/login` — the app's front door, added by Phase 2 of
 * `docs/handoffs/leave-telegram-v1.md`. It reverses the standing "do not build
 * a login UI" rule, on the owner's instruction; the rest of that rule holds —
 * **no self-serve signup**, so there is no link to one and no "create account"
 * copy. An account comes from `npm run user:add` or an owner's invite link,
 * which lands on `/join` instead.
 *
 * No back affordance: there is nothing above this screen, and every other route
 * is behind it.
 */

/**
 * One message for every failure, matching what the API is willing to say. The
 * server returns a single `Invalid username or passphrase` for both halves on
 * purpose — telling the two apart is a username oracle — and rendering its
 * string here would surface a raw API message, which §5 forbids. So the copy is
 * ours and the distinction is not restored by accident.
 */
const REJECTED = "That username and passphrase don't match."

/**
 * A 503 is the server telling us `AUTH_TOKEN_SECRET` (or `API_SHARED_SECRET`)
 * is unset. It is worth separating from a wrong passphrase, because retyping
 * cannot fix it and a user who believes they mistyped will keep trying.
 */
const UNAVAILABLE = "Sign-in isn't available right now. Try again later."

const FAILED = "Couldn't sign in. Check your connection and try again."

/** The API's per-username cap (`loginThrottle.ts`). Retyping now cannot work, so say how long. */
const THROTTLED = 'Too many tries for this username. Wait 15 minutes and try again.'

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return FAILED
  if (error.status === 401 || error.status === 400) return REJECTED
  if (error.status === 503) return UNAVAILABLE
  if (error.status === 429) return THROTTLED
  return FAILED
}

export function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const incomplete = username.trim() === '' || passphrase === ''

  const onSubmit = useCallback(
    (event: FormEvent) => {
      // A real <form> so the on-screen keyboard offers Go and a password
      // manager recognises the pair. Both need the default submit stopped.
      event.preventDefault()
      if (incomplete || submitting) return

      setSubmitting(true)
      setError(null)

      apiLogin(username.trim(), passphrase)
        .then((response) => {
          // The token is stored before navigating, so the list's queries fire
          // with a credential already in place rather than 401ing once and
          // bouncing straight back here.
          setToken(response.token)
          // Replace: back from the list must not return to a login screen the
          // user has already passed through.
          void navigate('/', { replace: true })
        })
        .catch((err: unknown) => {
          setError(messageFor(err))
          // Cleared on any failure. A wrong passphrase left in the box is one
          // stray tap from being submitted again unchanged, and it is the field
          // a shoulder-surfer benefits from most.
          setPassphrase('')
          setSubmitting(false)
        })
    },
    [incomplete, submitting, username, passphrase, navigate],
  )

  return (
    <Screen title="WeatherTeam6">
      <form onSubmit={onSubmit} style={{ ...cardV2, ...stack(spacing.listGapLg), marginTop: `${spacing.sectionTop}px` }}>
        <p style={{ ...typeV2.body, fontSize: '15px' }}>Sign in to see your locations.</p>

        <label style={stack(spacing.tight)}>
          <span style={typeV2.statLabel}>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={fieldV2}
            aria-label="Username"
          />
        </label>

        <label style={stack(spacing.tight)}>
          <span style={typeV2.statLabel}>Passphrase</span>
          <input
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            // type=password, and there is no reveal toggle. A passphrase is
            // long enough that one would help, and it is also the thing most
            // worth not putting on screen in a car park.
            type="password"
            autoComplete="current-password"
            style={fieldV2}
            aria-label="Passphrase"
          />
        </label>

        {error === null ? null : (
          // role=alert so the message reaches a screen reader; it appears after
          // a submit the user cannot see the result of otherwise.
          <span role="alert" style={{ ...typeV2.body, color: colorsV2.poorInk }}>
            {error}
          </span>
        )}

        <button
          type="submit"
          style={{ ...brandButton, width: '100%', opacity: incomplete || submitting ? 0.5 : 1 }}
          disabled={incomplete || submitting}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Screen>
  )
}
