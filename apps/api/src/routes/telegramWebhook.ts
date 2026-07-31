import { Router, type Request, type Response } from 'express'
import { logger } from '../lib/logger.js'
import { buildConditionsReply } from '../lib/telegram/conditionsReply.js'
import { sendTelegramMessage } from '../lib/telegram/sendMessage.js'

export const telegramWebhookRouter = Router()

type TelegramUpdate = {
  message?: {
    chat?: { id?: number }
    text?: string
  }
}

telegramWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  const update = req.body as TelegramUpdate
  const chatId = update.message?.chat?.id
  const expectedChatId = process.env['TELEGRAM_CHAT_ID']

  // This IS the auth boundary for the bot (single-user) — the API itself stays AUTH_ENABLED=false.
  if (!expectedChatId || String(chatId) !== expectedChatId) {
    res.sendStatus(200) // ack silently — never reveal to an unauthorized chat that this endpoint exists
    return
  }

  const text = update.message?.text?.trim() ?? ''

  try {
    if (text === '/start') {
      await sendTelegramMessage("Hi! Send /conditions <location name> and I'll check it for you.")
    } else if (text.startsWith('/conditions')) {
      const name = text.slice('/conditions'.length).trim()
      if (!name) {
        await sendTelegramMessage('Usage: /conditions <location name>')
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
