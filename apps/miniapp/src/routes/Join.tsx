import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { colors, colorsV2, spacing } from '@weatherteam6/design/tokens'
import { isValidUsername, MIN_PASSPHRASE_LENGTH, passphraseProblem } from '@weatherteam6/types'
import { type, typeV2 } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, inputBox, stack } from '../theme/styles.js'
import { apiRedeemInvite, ApiError } from '../lib/api.js'
import { setToken } from '../lib/authToken.js'
import { Screen } from '../components/Screen.js'

/**
 * `/join#<code>` — where an owner's invite link lands. The code rides in the
 * fragment so it never reaches a server log or a Referer. The friend picks a
 * username and passphrase, the API creates the account and signs them in.
 */

const UNUSABLE = 'This invite link has expired or has already been used. Ask for a new one.'
const TAKEN = 'That username is taken. Try another.'
const WEAK = 'That username or passphrase was refused. Try a longer passphrase of unrelated words.'
const UNAVAILABLE = "Joining isn't available right now. Try again later."
const FAILED = "Couldn't create your account. Check your connection and try again."

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return FAILED
  if (error.status === 410) return UNUSABLE
  // The screen applies the same rules first, so this is a mismatch between
  // client and server versions mid-deploy.
  if (error.status === 400) return WEAK
  if (error.status === 409) return TAKEN
  if (error.status === 503) return UNAVAILABLE
  return FAILED
}

export function Join() {
  const code = useLocation().hash.slice(1)
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const name = username.trim()
  const nameOk = isValidUsername(name)
  const weak = passphraseProblem(passphrase, name)
  const matches = passphrase === repeat
  const ready = nameOk && weak === null && matches

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready || submitting) return
    setSubmitting(true)
    setError(null)
    apiRedeemInvite({ code, username: name, passphrase })
      .then((response) => {
        setToken(response.token)
        void navigate('/', { replace: true })
      })
      .catch((err: unknown) => {
        setError(messageFor(err))
        setSubmitting(false)
      })
  }

  if (code === '') {
    return (
      <Screen title="WeatherTeam6">
        <p style={{ ...type.screenSub, marginTop: `${spacing.sectionTop}px` }}>
          This link is missing its invite code. Ask for a new one.
        </p>
      </Screen>
    )
  }

  const hint = (text: string, show: boolean) =>
    show ? <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>{text}</span> : null

  return (
    <Screen title="WeatherTeam6">
      <form onSubmit={onSubmit} style={{ ...stack(spacing.listGap), marginTop: `${spacing.sectionTop}px` }}>
        <p style={type.screenSub}>You’ve been invited. Pick a username and passphrase.</p>

        <label style={stack(spacing.micro)}>
          <span style={type.label}>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{ ...inputBox, ...type.calDay, width: '100%' }}
            aria-label="Username"
          />
          {hint('Lowercase letters, numbers, dots, dashes or underscores. 2 to 32 characters.', name !== '' && !nameOk)}
        </label>

        <label style={stack(spacing.micro)}>
          <span style={type.label}>Passphrase</span>
          <input
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            type="password"
            autoComplete="new-password"
            style={{ ...inputBox, ...type.calDay, width: '100%' }}
            aria-label="Passphrase"
          />
          {hint(
            passphrase === '' ? `At least ${MIN_PASSPHRASE_LENGTH} characters. A few unrelated words works well.` : (weak ?? ''),
            passphrase === '' || weak !== null,
          )}
        </label>

        <label style={stack(spacing.micro)}>
          <span style={type.label}>Repeat passphrase</span>
          <input
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            type="password"
            autoComplete="new-password"
            style={{ ...inputBox, ...type.calDay, width: '100%' }}
            aria-label="Repeat passphrase"
          />
          {hint('Doesn’t match yet.', repeat !== '' && !matches)}
        </label>

        {error === null ? null : (
          <span role="alert" style={{ ...type.bodySm, color: colors.poor }}>
            {error}
          </span>
        )}

        <button
          type="submit"
          style={{
            ...bareButton,
            ...btnPrimary,
            ...btnPrimaryText,
            textAlign: 'center',
            opacity: !ready || submitting ? 0.5 : 1,
          }}
          disabled={!ready || submitting}
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </Screen>
  )
}
