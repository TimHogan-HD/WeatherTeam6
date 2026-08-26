import { Router, type Request, type Response } from 'express'
import { logger } from '../lib/logger.js'
import { escapeTelegramHtml } from '@weatherteam6/types'
import { buildConditionsReply } from '../lib/telegram/conditionsReply.js'
import { sendTelegramMessage } from '../lib/telegram/sendMessage.js'
import { webhookSecretAccepted } from '../lib/telegram/webhookAuth.js'

export const telegramWebhookRouter = Router()

type TelegramUpdate = {
  message?: {
    chat?: { id?: number }
    text?: string
  }
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
  const chatId = update.message?.chat?.id
  const expectedChatId = process.env['TELEGRAM_CHAT_ID']?.trim()

  // This IS the auth boundary for the bot (single-user) — the API itself stays AUTH_ENABLED=false.
  // Trimmed to match `requireApiAuth`, which trims the same variable: an
  // accidental trailing space in the Vercel value would otherwise authorize the
  // Mini App and silently reject every bot command.
  if (!expectedChatId || String(chatId) !== expectedChatId) {
    res.sendStatus(200) // ack silently — never reveal to an unauthorized chat that this endpoint exists
    return
  }

  const text = update.message?.text?.trim() ?? ''

  try {
    if (text === '/start') {
      await sendTelegramMessage(
        // Escaped, not incidentally: sendTelegramMessage uses parse_mode HTML,
        // and Telegram rejects <location name> as an unsupported start tag with
        // a 400. This reply and the usage line below have both been failing
        // silently since they were written — the webhook catches and logs the
        // error, so the bot simply never answers /start.
        escapeTelegramHtml("Hi! Send /conditions <location name> and I'll check it for you."),
      )
    } else if (text.startsWith('/conditions')) {
      const name = text.slice('/conditions'.length).trim()
      if (!name) {
        await sendTelegramMessage(escapeTelegramHtml('Usage: /conditions <location name>'))
      } else {
        const reply = await buildConditionsReply(req.userId, name)
        await sendTelegramMessage(reply)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ err: msg }, '[telegramWebhook] failed to handle update')
  }

  res.sendStatus(200)
})
