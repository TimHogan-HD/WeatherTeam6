import { Router, type Request, type Response } from 'express'
import { and, eq, ilike } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { logger } from '../lib/logger.js'
import { computeLiveForecast } from '../lib/scoring/liveForecast.js'
import { sendTelegramMessage } from '../lib/telegram/sendMessage.js'

export const telegramWebhookRouter = Router()

type TelegramUpdate = {
  message?: {
    chat?: { id?: number }
    text?: string
  }
}

function statusLabel(score: number | null): string {
  if (score === null) return 'no score yet — this date is too far out for a reliable forecast'
  if (score >= 80) return 'looks great — go climb'
  if (score >= 60) return 'climbable, minor concerns'
  if (score >= 40) return 'marginal — check the details'
  return 'not recommended right now'
}

async function handleConditions(userId: string, name: string): Promise<string> {
  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      lat: locations.lat,
      lon: locations.lon,
      elevation_m: locations.elevation_m,
      rock_type: locations.rock_type,
      cliff_angle: locations.cliff_angle,
      aspect: locations.aspect,
      asos_station: locations.asos_station,
    })
    .from(locations)
    .where(and(eq(locations.user_id, userId), ilike(locations.name, `%${name}%`)))
    .limit(1)

  const location = rows[0]
  if (!location) {
    return `I don't have a saved location matching "${name}". Save it in the app first.`
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const { scores } = await computeLiveForecast(location)
  const todayScore = scores.find((s) => s.forecast_date === todayStr) ?? null

  return `<b>${location.name}</b>\n${statusLabel(todayScore?.score ?? null)}${todayScore ? ` (score ${todayScore.score ?? 'n/a'}, confidence ${todayScore.confidence})` : ''}`
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
        const reply = await handleConditions(req.userId, name)
        await sendTelegramMessage(reply)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ err: msg }, '[telegramWebhook] failed to handle update')
  }

  res.sendStatus(200)
})
