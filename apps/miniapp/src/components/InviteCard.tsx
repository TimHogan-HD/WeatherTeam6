import { useState } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import type { InviteCreated } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, cardV2, row, stack, wellV2 } from '../theme/styles.js'
import { useAccount, useCreateInvite } from '../hooks/useAccount.js'
import { InlineError } from './States.js'

/**
 * Profile's invite card, for the owner alone (`GET /me`'s `can_invite`; the
 * API refuses anyone else). Each tap mints a new single-use link.
 */
export function InviteCard() {
  const account = useAccount()
  const create = useCreateInvite()
  const [copied, setCopied] = useState(false)

  if (account.data?.can_invite !== true) return null

  const invite: InviteCreated | undefined = create.data
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
          A link that creates one account. It works once and expires in 7 days.
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
    </section>
  )
}
