/**
 * Read the usage log (`docs/usage-log.md`): which screens and crag tabs each
 * account opened, how often, and roughly for how long.
 *
 * Usage, from `apps/api`:
 *   npm run usage              the last 30 days
 *   npm run usage -- 7         the last 7 days
 *
 * Time on a screen is the gap to that account's next event, counted only when
 * the gap is under `MAX_GAP_MS`: the app reports when a screen opens, not when
 * the phone is put away, so a longer gap is someone who left, not someone
 * reading. The last screen of each visit has no next event and no time. These
 * are rough figures, said so in the output.
 *
 * console rather than the logger is deliberate — the output is the result.
 */
import { summarizeUsage, type UsageRow } from '../lib/usage/summarize.js'

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('\nMissing DATABASE_URL — the Neon pooled connection string.\n')
    process.exit(2)
  }
  const arg = process.argv[2]
  const days = arg === undefined ? 30 : Number(arg)
  if (!Number.isInteger(days) || days < 1) {
    console.error('\nUsage: npm run usage [-- <days>]\n')
    process.exit(2)
  }

  const { asc, eq, gte } = await import('drizzle-orm')
  const { db, pool } = await import('../db/index.js')
  const { usageEvents, users } = await import('../db/schema.js')

  try {
    const since = new Date(Date.now() - days * 86_400_000)
    const rows: UsageRow[] = await db
      .select({
        username: users.username,
        user_id: usageEvents.user_id,
        screen: usageEvents.screen,
        tab: usageEvents.tab,
        at: usageEvents.created_at,
      })
      .from(usageEvents)
      .innerJoin(users, eq(users.id, usageEvents.user_id))
      .where(gte(usageEvents.created_at, since))
      .orderBy(asc(usageEvents.user_id), asc(usageEvents.created_at))

    const accounts = summarizeUsage(rows)
    console.log(`\nUsage, last ${days} days (${rows.length} events). Time is approximate: see docs/usage-log.md.\n`)
    if (accounts.length === 0) console.log('No usage recorded.\n')
    for (const account of accounts) {
      console.log(`${account.username} — ${account.events} events`)
      for (const s of account.screens) {
        const median = s.medianSeconds === null ? '—' : `${s.medianSeconds} s`
        console.log(`  ${s.label.padEnd(36)} ${String(s.count).padStart(5)}   median ${median}`)
      }
      console.log('')
    }
  } finally {
    await pool.end()
  }
}

run().catch(async (err: unknown) => {
  const { describeError } = await import('../lib/http.js')
  console.error(describeError(err))
  process.exit(1)
})
