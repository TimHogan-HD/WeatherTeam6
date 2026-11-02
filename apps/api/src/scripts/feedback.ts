/**
 * Read and clear feedback from the operator's side — every account's, not one
 * user's as `GET /feedback` is.
 *
 * Usage, from `apps/api`:
 *   npm run feedback -- list              open items, oldest first
 *   npm run feedback -- resolve <id>...   mark items acted on
 *   npm run feedback -- facing <id> <stop> <point>
 *                                         correct a stop's wall direction (stop
 *                                         counts from 1), when the climber says
 *                                         they named it wrong
 *
 * Resolve an item once the change that answers it has merged. A resolved row
 * leaves the list in the app and here, and stays in the table: a forecast check
 * is evidence for #143 whether or not anyone has read it.
 *
 * console rather than the logger is deliberate — the output is the result.
 */

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('\nMissing DATABASE_URL — the Neon pooled connection string.\n')
    process.exit(2)
  }
  const [command, ...ids] = process.argv.slice(2)
  if (command !== 'list' && command !== 'resolve' && command !== 'facing') {
    console.error('\nUsage: npm run feedback -- list | resolve <id>... | facing <id> <stop> <point>\n')
    process.exit(2)
  }

  const { and, asc, eq, inArray, isNull } = await import('drizzle-orm')
  const { db, pool } = await import('../db/index.js')
  const { feedback, users } = await import('../db/schema.js')
  const { isUuid } = await import('../lib/http.js')
  const { isCompassPoint } = await import('@weatherteam6/types')

  try {
    if (command === 'facing') {
      const [id, stopArg, point] = ids
      const stop = Number(stopArg)
      if (id === undefined || !isUuid(id) || !Number.isInteger(stop) || stop < 1 || !isCompassPoint(point)) {
        console.error('\nGive a feedback id, a stop number from 1, and a compass point (N, NE, …)\n')
        process.exitCode = 2
        return
      }
      const [row] = await db.select({ stops: feedback.stops }).from(feedback).where(eq(feedback.id, id))
      const stops = row?.stops
      if (!Array.isArray(stops) || stops.length < stop || typeof stops[stop - 1] !== 'object' || stops[stop - 1] === null) {
        console.error(`\nNo stop ${stop} on ${id}\n`)
        process.exitCode = 1
        return
      }
      const was = (stops[stop - 1] as { facing?: unknown }).facing ?? null
      const next = stops.map((s: unknown, i) => (i === stop - 1 ? { ...(s as object), facing: point } : s))
      await db.update(feedback).set({ stops: next }).where(eq(feedback.id, id))
      console.log(`  stop ${stop} of ${id}: facing ${String(was)} → ${point}`)
      return
    }

    if (command === 'list') {
      const rows = await db
        .select({ f: feedback, username: users.username })
        .from(feedback)
        .innerJoin(users, eq(users.id, feedback.user_id))
        .where(isNull(feedback.resolved_at))
        .orderBy(asc(feedback.created_at))
      if (rows.length === 0) console.log('\nNo open feedback.\n')
      for (const { f, username } of rows) {
        const head = [f.kind, f.created_at.toISOString().slice(0, 16), username ?? 'unnamed user', f.location_name]
          .filter((p) => p !== null)
          .join(' · ')
        console.log(`\n${f.id}\n  ${head}`)
        if (f.kind === 'forecast') {
          console.log(`  observed ${f.observed_at?.toISOString().slice(0, 16) ?? '—'}: rock ${f.observed_conditions ?? '—'}, forecast ${f.verdict ?? '—'}`)
          console.log(`  stops: ${f.stops === null ? 'none named' : JSON.stringify(f.stops)}`)
          console.log(`  app said: ${f.app_readings === null ? 'nothing attached' : JSON.stringify(f.app_readings)}`)
        }
        if (f.message !== null) console.log(`  ${f.message.replace(/\n/g, '\n  ')}`)
      }
      console.log(`\n${rows.length} open\n`)
      return
    }

    const bad = ids.filter((id) => !isUuid(id))
    if (ids.length === 0 || bad.length > 0) {
      console.error(`\nGive one or more feedback ids${bad.length > 0 ? `; not ids: ${bad.join(', ')}` : ''}\n`)
      process.exitCode = 2
      return
    }
    const done = await db
      .update(feedback)
      .set({ resolved_at: new Date() })
      .where(and(inArray(feedback.id, ids), isNull(feedback.resolved_at)))
      .returning({ id: feedback.id })
    const resolved = new Set(done.map((r) => r.id))
    for (const id of ids) console.log(`  ${resolved.has(id) ? 'resolved' : 'unchanged (already resolved, or no such id)'}  ${id}`)
  } finally {
    await pool.end()
  }
}

run().catch(async (err: unknown) => {
  const { describeError } = await import('../lib/http.js')
  console.error(describeError(err))
  process.exit(1)
})
