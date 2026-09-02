import { Router, type Request, type Response } from 'express'
import { escapeTelegramHtml } from '@weatherteam6/types'
import { logger } from '../lib/logger.js'
import { isUuid } from '../lib/http.js'
import { decodeAction } from '../lib/telegram/callbackData.js'
import { formatHelp, parseCommand } from '../lib/telegram/commands.js'
import { formatLocationNotFound } from '../lib/telegram/conditionsMessage.js'
import { findLocationByName } from '../lib/telegram/conditionsReply.js'
import { isIntervalHours, isTableUnits } from '../lib/telegram/forecastTable.js'
import {
  buildRetryPanel,
  EXPIRED_PANEL_TEXT,
  FIELD_DAY,
  FIELD_INTERVAL,
  FIELD_UNITS,
  OPEN_FIELDS,
  VERB_MODE,
  VERB_OPEN,
  VERB_REFRESH,
  VERB_SET,
  VERB_VIEW,
  type OpenField,
} from '../lib/telegram/panels.js'
import {
  createPanelState,
  isPanelMode,
  isPanelView,
  loadPanelState,
  MAX_DAY_OFFSET,
  updatePanelState,
  type PanelState,
} from '../lib/telegram/panelState.js'
import { renderPanel } from '../lib/telegram/panelViews.js'
import {
  answerCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage,
} from '../lib/telegram/sendMessage.js'
import { webhookSecretAccepted } from '../lib/telegram/webhookAuth.js'

export const telegramWebhookRouter = Router()

type TelegramChat = { id?: number }

type TelegramUpdate = {
  message?: {
    chat?: TelegramChat
    text?: string
  }
  callback_query?: {
    id?: string
    data?: string
    /** Who tapped. Distinct from the chat the message lives in — both are checked. */
    from?: { id?: number }
    message?: {
      message_id?: number
      chat?: TelegramChat
    }
  }
}

/**
 * The single-user auth boundary for the bot. The API itself stays
 * `AUTH_ENABLED=false`.
 *
 * Trimmed to match `requireApiAuth`, which trims the same variable: an
 * accidental trailing space in the Vercel value would otherwise authorize the
 * Mini App and silently reject every bot command.
 *
 * Returns `null` when the variable is unset, which refuses everything — the same
 * fail-closed posture `API_SHARED_SECRET` has.
 */
function expectedChatId(): string | null {
  const value = process.env['TELEGRAM_CHAT_ID']?.trim()
  return value === undefined || value === '' ? null : value
}

function matchesChat(id: number | undefined, expected: string): boolean {
  return id !== undefined && String(id) === expected
}

telegramWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  // Always ack with 200, whatever the reason for refusing: a non-200 makes
  // Telegram redeliver the same update, and revealing that this endpoint exists
  // to an unauthorized caller is the thing being avoided.
  const webhookSecret = process.env['TELEGRAM_WEBHOOK_SECRET']
  if (!webhookSecret) {
    logger.warn(
      '[telegramWebhook] TELEGRAM_WEBHOOK_SECRET is not set — falling back to the forgeable chat.id check alone',
    )
  }
  if (!webhookSecretAccepted(req.headers['x-telegram-bot-api-secret-token'], webhookSecret)) {
    logger.warn('[telegramWebhook] rejected update: bad or missing secret token')
    res.sendStatus(200)
    return
  }

  const update = req.body as TelegramUpdate
  const expected = expectedChatId()

  try {
    if (expected === null) {
      logger.warn('[telegramWebhook] TELEGRAM_CHAT_ID is not set — refusing every update')
    } else if (update.callback_query) {
      // **Both** identities are checked. A tap carries `from.id` (who pressed)
      // and `message.chat.id` (where the panel lives), and checking only the
      // chat would let anyone who can reach a forwarded panel drive it, while
      // checking only `from` would accept a tap in a chat this bot never posted
      // to. The whole button surface is new, so both are new holes.
      const q = update.callback_query
      if (matchesChat(q.from?.id, expected) && matchesChat(q.message?.chat?.id, expected)) {
        await handleCallbackQuery(req.userId, q)
      }
    } else if (update.message) {
      if (matchesChat(update.message.chat?.id, expected)) {
        await handleMessage(req.userId, update.message.text?.trim() ?? '')
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ err: msg }, '[telegramWebhook] failed to handle update')
  }

  res.sendStatus(200)
})

/**
 * Send a panel as a new message. Used by every command; a tap edits instead.
 */
async function sendPanel(userId: string, state: PanelState): Promise<void> {
  const panel = await renderPanel(userId, state)
  await sendTelegramMessage(panel.text, panel.keyboard)
}

async function handleMessage(userId: string, text: string): Promise<void> {
  const command = parseCommand(text)
  // Not a command. Staying silent is deliberate: this is a private chat with a
  // single user, and answering every stray line with usage text is noise.
  if (command === null) return

  // The `@botname` suffix is accepted and ignored. The bot's username is not
  // derivable from `TELEGRAM_BOT_TOKEN`, and in a single-user private chat there
  // is no second bot for a command to be addressed to.
  switch (command.name) {
    case 'start':
    case 'help':
      await sendPanel(userId, await createPanelState(userId, { view: 'help' }))
      return

    case 'locations':
      await sendPanel(userId, await createPanelState(userId, { view: 'list' }))
      return

    case 'alerts':
      await sendPanel(userId, await createPanelState(userId, { view: 'alerts' }))
      return

    case 'forecast':
    case 'rain': {
      // A name opens that location's panel; no name opens the picker rather than
      // a usage line the user has to retype.
      //
      // **The picker remembers which command opened it.** It used to open a
      // plain `list`, whose buttons all opened *conditions* — so typing
      // `/forecast` and tapping your crag landed on the conditions panel, and
      // all three commands appeared to do the same thing.
      if (command.args === '') {
        await sendPanel(
          userId,
          await createPanelState(userId, {
            view: command.name === 'rain' ? 'pick_rain' : 'pick_forecast',
          }),
        )
        return
      }
      const location = await findLocationByName(userId, command.args)
      if (location === null) {
        await sendTelegramMessage(formatLocationNotFound(command.args))
        return
      }
      await sendPanel(
        userId,
        await createPanelState(userId, {
          view: command.name === 'rain' ? 'rain' : 'forecast',
          locationId: location.id,
        }),
      )
      return
    }

    case 'conditions': {
      if (command.args === '') {
        // No name given — the picker answers the question rather than a usage
        // line the user then has to retype.
        await sendPanel(userId, await createPanelState(userId, { view: 'list' }))
        return
      }
      const location = await findLocationByName(userId, command.args)
      if (location === null) {
        await sendTelegramMessage(formatLocationNotFound(command.args))
        return
      }
      await sendPanel(
        userId,
        await createPanelState(userId, { view: 'conditions', locationId: location.id }),
      )
      return
    }

    default:
      // Named, not ignored: an unregistered command typed by hand otherwise
      // looks like the bot is down.
      await sendTelegramMessage(
        `${escapeTelegramHtml(`I don't know /${command.name}.`)}\n\n${formatHelp()}`,
      )
      return
  }
}

type CallbackQuery = NonNullable<TelegramUpdate['callback_query']>

async function handleCallbackQuery(userId: string, q: CallbackQuery): Promise<void> {
  const queryId = q.id
  if (queryId === undefined) return

  // **Answered before any work.** The client spins until the query is answered
  // and gives up at about 15 seconds; a conditions render is an ensemble fetch
  // plus a rainfall fetch, which can outlast that, and a user watching a dead
  // button taps it again.
  await answerCallbackQuery(queryId)

  const messageId = q.message?.message_id
  if (messageId === undefined) {
    // Nothing to edit — Telegram omits the message once it is too old. Say so on
    // a new message rather than silently doing nothing.
    await sendTelegramMessage(EXPIRED_PANEL_TEXT)
    return
  }

  const action = q.data === undefined ? null : decodeAction(q.data)
  if (action === null) {
    await editTelegramMessage(messageId, EXPIRED_PANEL_TEXT, null)
    return
  }

  const state = await loadPanelState(action.stateId, userId)
  if (state === null) {
    // Pruned at 7 days, or an id from another chat. Never a guess at what the
    // panel used to be showing.
    await editTelegramMessage(messageId, EXPIRED_PANEL_TEXT, null)
    return
  }

  const next = await applyAction(userId, state, action.verb, action.field, action.value)
  if (next === null) {
    await editTelegramMessage(messageId, EXPIRED_PANEL_TEXT, null)
    return
  }

  let panel
  try {
    panel = await renderPanel(userId, next)
  } catch (err) {
    // A tapped button that changes nothing on screen reads as a broken bot. The
    // outer handler logs, but the user has to be told something happened —
    // rendering a conditions panel is an upstream fetch and it can fail.
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      '[telegramWebhook] failed to render a panel',
    )
    // The copy and the retry button are built together in `panels.ts`, not
    // assembled here from a string plus whichever keyboard that module happens
    // to attach. That split is what let the message tell the user to tap a 🔄
    // the nav row had stopped carrying.
    const notice = buildRetryPanel(next.id)
    await editTelegramMessage(messageId, notice.text, notice.keyboard)
    return
  }

  // A re-tap of the tab already showing produces byte-identical text and markup,
  // which Telegram calls a 400 "message is not modified". `editTelegramMessage`
  // tolerates exactly that one.
  await editTelegramMessage(messageId, panel.text, panel.keyboard)
}

/**
 * Apply one button's worth of change and return the state to render, or `null`
 * when the button cannot be honoured — an unknown verb from an older deploy, a
 * value this build does not recognise, or a row that vanished mid-update.
 *
 * Every branch re-reads the state from the write rather than patching the object
 * in memory, so what renders is what was stored.
 */
async function applyAction(
  userId: string,
  state: PanelState,
  verb: string,
  field: string | null,
  value: string | null,
): Promise<PanelState | null> {
  switch (verb) {
    case VERB_REFRESH:
      // Nothing to write. The render is the refresh: every panel reads live.
      return state

    case VERB_OPEN: {
      // The field names the destination — `loc` conditions, `locf` hourly,
      // `locr` rain — so the picker opened by `/forecast` lands on the forecast.
      if (field === null || value === null || !isUuid(value)) return null
      if (!Object.prototype.hasOwnProperty.call(OPEN_FIELDS, field)) return null
      const target = OPEN_FIELDS[field as OpenField]
      return updatePanelState(state.id, userId, { view: target, locationId: value })
    }

    case VERB_VIEW: {
      if (field !== 'v' || value === null || !isPanelView(value)) return null
      return updatePanelState(state.id, userId, { view: value })
    }

    case VERB_MODE: {
      if (field !== 'm' || value === null || !isPanelMode(value)) return null
      return updatePanelState(state.id, userId, { mode: value })
    }

    /**
     * One setting per tap. Every value is validated against the same predicate
     * the renderer uses, so a payload from an older deploy — or one typed by
     * hand — reads as expired instead of writing a value nothing can render.
     */
    case VERB_SET: {
      if (value === null) return null
      switch (field) {
        case FIELD_DAY: {
          const day = Number(value)
          if (!Number.isInteger(day) || day < 0 || day > MAX_DAY_OFFSET) return null
          return updatePanelState(state.id, userId, { dayOffset: day })
        }
        case FIELD_INTERVAL: {
          const hours = Number(value)
          if (!Number.isInteger(hours) || !isIntervalHours(hours)) return null
          return updatePanelState(state.id, userId, { intervalHours: hours })
        }
        case FIELD_UNITS: {
          if (!isTableUnits(value)) return null
          return updatePanelState(state.id, userId, { units: value })
        }
        default:
          return null
      }
    }

    default:
      return null
  }
}
