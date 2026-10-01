/**
 * Read and clear feedback from the operator's side — every account's, not one
 * user's as `GET /feedback` is.
 *
 * Usage, from `apps/api`:
 *   npm run feedback -- list              open items, oldest first
 *   npm run feedback -- resolve <id>...   mark items acted on
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
  if (command !== 'list' && command !== 'resolve') {
    console.error('\nUsage: npm run feedback -- list | resolve <id>...\n')
    process.exit(2)
  }

  const { and, asc, eq, inArray, isNull } = await import('drizzle-orm')
  const { db, pool } = await import('../db/index.js')
  const { feedback, users } = await import('../db/schema.js')
  const { isUuid } = await import('../lib/http.js')

  try {
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
