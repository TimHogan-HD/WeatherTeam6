import { describe, expect, it } from 'vitest'
import { formatAlertMessage } from './alertMessage.js'

/**
 * These are about a live outage, not formatting taste.
 *
 * The message goes out with `parse_mode: 'HTML'`. Telegram rejects malformed
 * markup with a 400, which `sendTelegramMessage` treats as non-retryable — so
 * `notifyPendingAlerts` releases the claim, retries the identical broken
 * message on the next run, and the alert is never delivered. An NWS headline
 * containing `&` is enough to trigger it, and those are routine.
 */
describe('formatAlertMessage', () => {
  it('escapes an ampersand in the NWS headline', () => {
    const msg = formatAlertMessage(
      'Red Rock',
      'Flood Watch',
      'Severe',
      'Flooding of rivers & streams expected',
    )
    expect(msg).toContain('rivers &amp; streams')
    expect(msg).not.toContain('rivers & streams')
  })

  it('escapes an ampersand in a user-chosen location name', () => {
    const msg = formatAlertMessage('Bear & Cub', 'Wind Advisory', 'Moderate', null)
    expect(msg).toContain('Bear &amp; Cub')
  })

  it('escapes angle brackets, so no interpolated value can inject markup', () => {
    const msg = formatAlertMessage('<b>x</b>', 'Wind Advisory', 'Moderate', '<i>y</i>')
    expect(msg).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(msg).toContain('&lt;i&gt;y&lt;/i&gt;')
    // The one intentional tag is still the template's own.
    expect(msg.match(/<b>/g)).toHaveLength(1)
  })

  it('keeps the tags the template itself adds', () => {
    const msg = formatAlertMessage('Red Rock', 'Wind Advisory', 'Moderate', null)
    expect(msg).toContain('<b>Moderate alert</b>')
    expect(msg).toContain('Red Rock')
  })

  it('falls back to the event when there is no headline', () => {
    const msg = formatAlertMessage('Red Rock', 'Wind Advisory', 'Moderate', null)
    expect(msg).toContain('Wind Advisory: Wind Advisory')
  })
})
