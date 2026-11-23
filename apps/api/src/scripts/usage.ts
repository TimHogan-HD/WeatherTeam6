/**
 * Read the usage log (`docs/usage-log.md`): which screens and crag tabs were
 * opened, how often, and roughly for how long. No account is stored, so there
 * is no per-person view; only the owner's own use is marked, and left out
 * unless asked for.
 *
 * Usage, from `apps/api`:
 *   npm run usage                     everyone but the owner, the last 30 days
 *   npm run usage -- 7                the last 7 days
 *   npm run usage -- --owner          the owner's use only
 *   npm run usage -- 7 --all          everyone, the owner included
 *
 * Time on a screen is the gap to the same visit's next event, counted only
 * when the gap is under `MAX_GAP_MS`: the app reports when a screen opens, not
 * when the phone is put away, so a longer gap is someone who left, not someone
 * reading. The last screen of each visit has no next event and no time.
 *
 * console rather than the logger is deliberate — the output is the result.
 */
import { summarizeUsage } from '../lib/usage/summarize.js'

const WHO_LABEL = { others: 'everyone but the owner', owner: 'the owner only', all: 'everyone' } as const

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('\nMissing DATABASE_URL — the Neon pooled connection string.\n')
    process.exit(2)
  }
  const args = process.argv.slice(2)
  const flags = args.filter((a) => a.startsWith('--'))
  const numbers = args.filter((a) => !a.startsWith('--'))
  const days = numbers[0] === undefined ? 30 : Number(numbers[0])
  const who = flags.length === 0 ? 'others' : flags[0] === '--owner' ? 'owner' : flags[0] === '--all' ? 'all' : null
  if (!Number.isInteger(days) || days < 1 || numbers.length > 1 || flags.length > 1 || who === null) {
    console.error('\nUsage: npm run usage [-- <days>] [--owner | --all]\n')
    process.exit(2)
  }

  const { and, eq, gte } = await import('drizzle-orm')
  const { db, pool } = await import('../db/index.js')
  const { usageEvents } = await import('../db/schema.js')

  try {
    const since = new Date(Date.now() - days * 86_400_000)
    const rows = await db
      .select({ visit_id: usageEvents.visit_id, screen: usageEvents.screen, tab: usageEvents.tab, at: usageEvents.created_at })
      .from(usageEvents)
      .where(
        and(
          gte(usageEvents.created_at, since),
          who === 'all' ? undefined : eq(usageEvents.owner, who === 'owner'),
        ),
      )

    const summary = summarizeUsage(rows)
    console.log(
      `\nUsage, last ${days} days, ${WHO_LABEL[who]}: ${summary.events} events over ${summary.visits} visits.` +
        ' Time is approximate: see docs/usage-log.md.\n',
    )
    if (summary.screens.length === 0) console.log('No usage recorded.\n')
    for (const s of summary.screens) {
      const median = s.medianSeconds === null ? '—' : `${s.medianSeconds} s`
      console.log(`  ${s.label.padEnd(36)} ${String(s.count).padStart(5)}   median ${median}`)
    }
    console.log('')
  } finally {
    await pool.end()
  }
}

run().catch(async (err: unknown) => {
  const { describeError } = await import('../lib/http.js')
  console.error(describeError(err))
  process.exit(1)
})
