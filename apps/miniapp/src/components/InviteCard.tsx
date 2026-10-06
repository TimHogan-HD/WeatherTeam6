import { useState } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { inviteStatus, type InviteCreated } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, cardV2, row, stack, wellV2 } from '../theme/styles.js'
import { useAccount, useCancelInvite, useCreateInvite, useInvites } from '../hooks/useAccount.js'
import { useNow } from '../hooks/useNow.js'
import { InlineError } from './States.js'

/**
 * Profile's invite card, for the owner alone (`GET /me`'s `can_invite`; the
 * API refuses anyone else). Each tap mints a new single-use link.
 */
export function InviteCard() {
  const account = useAccount()
  const create = useCreateInvite()
  const cancel = useCancelInvite()
  const [copied, setCopied] = useState(false)

  if (account.data?.can_invite !== true) return null

  // A link cancelled from the list below must not stay on screen to be shared.
  const cancelledShown = cancel.isSuccess && cancel.variables === create.data?.id
  const invite: InviteCreated | undefined = cancelledShown ? undefined : create.data
  const link = invite === undefined ? null : `${window.location.origin}/join#${invite.code}`
  const canShare = typeof navigator.share === 'function'

  const share = (url: string) => {
    if (canShare) {
      navigator.share({ title: 'WeatherTeam6', text: 'Join me on WeatherTeam6', url }).catch(() => undefined)
      return
    }
    navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      .catch(() => undefined)
  }

  const pill = {
    ...bareButton,
    width: 'auto',
    border: `1px solid ${colorsV2.line}`,
    borderRadius: `${radius.full}px`,
    padding: `${spacing.listGap}px ${spacing.cardPad}px`,
  }

  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <div style={stack(spacing.micro)}>
        <h2 style={typeV2.cardTitle}>Invite someone</h2>
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
          A link that creates one account. It works once and expires in 2 days. Send it to one person, privately.
        </p>
      </div>

      {link === null || invite === undefined ? null : (
        <div style={stack(spacing.listGap)}>
          <div
            style={{
              ...wellV2,
              ...typeV2.note,
              color: colorsV2.txt1,
              borderRadius: `${radius.cardV2}px`,
              padding: `${spacing.listGap}px ${spacing.cardPad}px`,
              overflowWrap: 'anywhere',
            }}
          >
            {link}
          </div>
          <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
            Expires {new Date(invite.expires_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}.
          </p>
          <div style={{ ...row(spacing.cellPad), flexWrap: 'wrap' }}>
            <button type="button" style={pill} onClick={() => share(link)}>
              <span style={typeV2.controlValue}>{canShare ? 'Share' : copied ? 'Copied' : 'Copy link'}</span>
            </button>
            {canShare ? (
              <button
                type="button"
                style={pill}
                onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true), () => undefined)}
              >
                <span style={typeV2.controlValue}>{copied ? 'Copied' : 'Copy link'}</span>
              </button>
            ) : null}
          </div>
        </div>
      )}

      {create.isError ? <InlineError message="Couldn’t create a link. Check your connection and try again." /> : null}

      <button
        // Keyed so the two looks are two elements: their styles mix shorthand
        // and longhand properties, which React will not swap on one element.
        key={link === null ? 'first' : 'another'}
        type="button"
        disabled={create.isPending}
        onClick={() => {
          setCopied(false)
          create.mutate()
        }}
        style={{
          ...bareButton,
          ...(link === null ? { ...btnPrimary, ...btnPrimaryText } : typeV2.cardLink),
          textAlign: 'center',
          opacity: create.isPending ? 0.5 : 1,
        }}
      >
        {create.isPending ? 'Creating…' : link === null ? 'Create invite link' : 'Create another link'}
      </button>

      <InviteList cancel={cancel} />
    </section>
  )
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * Every link the owner has made, with who joined through it. An account the
 * owner does not recognise here is how a forwarded link would show.
 */
function InviteList({ cancel }: { cancel: ReturnType<typeof useCancelInvite> }) {
  const invites = useInvites()
  const now = new Date(useNow())

  if (invites.isPending) return null
  if (invites.isError) {
    return <InlineError message="Couldn’t load your links." onRetry={() => void invites.refetch()} />
  }
  if (invites.data.length === 0) return null

  return (
    <div style={stack(spacing.listGap)}>
      <h3 style={{ ...typeV2.gaugeLabel, color: colorsV2.txtMuted }}>Your links</h3>
      <ul style={{ ...stack(spacing.listGap), listStyle: 'none', margin: 0, padding: 0 }}>
        {invites.data.map((invite) => {
          const status = inviteStatus(invite, now)
          const cancelling = cancel.isPending && cancel.variables === invite.id
          return (
            <li key={invite.id} style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={stack(spacing.micro)}>
                <span style={{ ...typeV2.controlValue, color: colorsV2.txt1 }}>
                  {status === 'joined' ? `Joined as ${invite.joined_as ?? 'a deleted account'}` : status === 'open' ? 'Not used yet' : 'Expired, never used'}
                </span>
                <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
                  {status === 'joined' && invite.used_at !== null
                    ? shortDate(invite.used_at)
                    : status === 'open'
                      ? `Expires ${shortDate(invite.expires_at)}`
                      : `Made ${shortDate(invite.created_at)}`}
                </span>
              </div>
              {status === 'open' ? (
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => cancel.mutate(invite.id)}
                  style={{ ...bareButton, ...typeV2.cardLink, width: 'auto', padding: `${spacing.listGap}px`, opacity: cancelling ? 0.5 : 1 }}
                  aria-label={`Cancel the link that expires ${shortDate(invite.expires_at)}`}
                >
                  {cancelling ? 'Cancelling…' : 'Cancel'}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {cancel.isError ? <InlineError message="Couldn’t cancel that link. Try again." /> : null}
    </div>
  )
}
