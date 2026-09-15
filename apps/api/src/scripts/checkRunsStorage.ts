/**
 * What is actually in `weather_runs` and what it is costing.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:runs-storage
 *
 * **Read-only. Deletes nothing, writes nothing, fetches nothing upstream.**
 *
 * Written on 2026-09-10, when production reached Neon's 512 MB project cap and
 * every write began failing with `could not extend file`. Two questions were
 * unanswerable from outside the database and both matter before touching
 * retention again:
 *
 *  - **Did a prune actually free anything?** `PARSED_RETENTION_DAYS` changing is a
 *    policy change; space comes back only once the prune has run *and* autovacuum
 *    has been through behind it. Those are three separate events and the row
 *    counts tell them apart.
 *  - **Where is the space going?** The estimate that justified cutting retention
 *    put nearly all of it in `weather_run_hours`. That was arithmetic, not a
 *    measurement, and a plan built on an unmeasured estimate is the thing this
 *    repo keeps writing down not to do.
 *
 * `pg_total_relation_size` includes indexes and TOAST, which is the number that
 * matters against a project cap — `pg_relation_size` alone would under-report the
 * hours tables badly, since both are mostly primary-key index.
 *
 * **Sizes here do not fall when rows are deleted, and that is not a bug in the
 * prune.** A DELETE marks tuples dead; the relation keeps its pages. Measured on
 * 2026-09-10: a prune removed 4,953 runs and 705,600 hour rows and every size in
 * this report was byte-identical afterwards. The dead-tuple section below is what
 * distinguishes that from a database that is genuinely full, because the two look
 * the same here and need opposite actions.
 *
 * console rather than the logger is deliberate — this is an operator CLI and its
 * output is the result.
 */

// Runtime imports are deferred into run(): `../db/index.js` throws at import time
// when DATABASE_URL is unset, which would pre-empt the explanation with a stack trace.

type Row = Record<string, unknown>

function str(v: unknown): string {
  return v === null || v === undefined ? '—' : String(v)
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function ago(v: unknown): string {
  if (v === null || v === undefined) return 'never'
  const t = new Date(String(v)).getTime()
  if (!Number.isFinite(t)) return 'unparseable'
  const h = (Date.now() - t) / 3_600_000
  return h < 1 ? `${Math.round(h * 60)}m ago` : `${h.toFixed(1)}h ago`
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('DATABASE_URL is not set. Set it in your shell, not in a .env file:')
    console.error('  $env:DATABASE_URL = "<Neon pooled connection string>"')
    process.exitCode = 1
    return
  }

  const { db } = await import('../db/index.js')
  const { sql } = await import('drizzle-orm')
  const { PARSED_RETENTION_DAYS, RAW_RETENTION_HOURS } = await import('../lib/runs/pruneRuns.js')

  console.log('\n=== check:runs-storage ===\n')

  // ── total project size, the number the cap is measured against ───────────────
  const dbSize = await db.execute(sql`
    SELECT pg_database_size(current_database()) AS bytes,
           pg_size_pretty(pg_database_size(current_database())) AS pretty
  `)
  const sizeRow = (dbSize.rows[0] ?? {}) as Row
  const totalMb = num(sizeRow['bytes']) / 1_048_576
  console.log(`  Database total: ${str(sizeRow['pretty'])}  (Neon free tier caps a project at 512 MB)`)
  if (totalMb > 460) console.log('  ** At or near the cap — writes will be rejected. **')
  console.log('')

  // ── per-table, including indexes and TOAST ───────────────────────────────────
  const tables = await db.execute(sql`
    SELECT relname AS name,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
           pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 12
  `)
  console.log('  Largest tables (data + indexes + TOAST):')
  for (const r of tables.rows as Row[]) {
    const share = totalMb > 0 ? (num(r['bytes']) / 1_048_576 / totalMb) * 100 : 0
    console.log(`    ${str(r['name']).padEnd(26)} ${str(r['total']).padStart(10)}  ${share.toFixed(0)}%`)
  }
  console.log('')

  // ── how much of it is prunable under the current policy ──────────────────────
  const runs = await db.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE fetched_at < now() - (${PARSED_RETENTION_DAYS} || ' days')::interval)::int AS expired,
           count(*) FILTER (WHERE raw IS NOT NULL)::int AS with_raw,
           count(*) FILTER (WHERE raw IS NOT NULL AND fetched_at < now() - (${RAW_RETENTION_HOURS} || ' hours')::interval)::int AS raw_clearable,
           min(fetched_at) AS oldest,
           max(fetched_at) AS newest
    FROM weather_runs
  `)
  const r = (runs.rows[0] ?? {}) as Row

  console.log(`  weather_runs: ${str(r['total'])} rows`)
  console.log(`    oldest fetched_at    ${ago(r['oldest'])}`)
  console.log(`    newest fetched_at    ${ago(r['newest'])}`)
  console.log(
    `    past ${PARSED_RETENTION_DAYS}-day retention  ${str(r['expired'])}  <- what a prune would delete now`,
  )
  console.log(
    `    carrying raw payload ${str(r['with_raw'])} (${str(r['raw_clearable'])} past the ${RAW_RETENTION_HOURS}h raw window)`,
  )
  console.log('')

  const hours = await db.execute(sql`SELECT count(*)::int AS n FROM weather_run_hours`)
  const ensHours = await db.execute(sql`SELECT count(*)::int AS n FROM weather_ensemble_hours`)
  console.log(`  weather_run_hours:      ${str((hours.rows[0] as Row)['n'])} rows`)
  console.log(`  weather_ensemble_hours: ${str((ensHours.rows[0] as Row)['n'])} rows`)
  console.log('')

  // ── orphans: a run row whose hours never landed ──────────────────────────────
  //
  // This is the shape a write failure leaves behind, and it is what check:hourly
  // saw as "1 model stored, 0 hours between them". Counting it here says whether
  // that was one unlucky location or the state of the whole table.
  const orphans = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM weather_runs wr
    WHERE wr.kind = 'deterministic'
      AND NOT EXISTS (SELECT 1 FROM weather_run_hours h WHERE h.run_id = wr.id)
  `)
  const orphanCount = num((orphans.rows[0] as Row)['n'])
  console.log(`  deterministic runs with NO hours: ${orphanCount}`)
  if (orphanCount > 0) {
    console.log('    A run row written while the hours insert failed — the signature of a')
    console.log('    storage failure, not of an upstream one. These are rows, not errors:')
    console.log('    they make a point look collected when nothing was stored.')
  }
  console.log('')

  // ── dead tuples: the difference between "full" and "deleted, not yet vacuumed" ──
  //
  // Without this the report cannot tell those two apart, and they need opposite
  // actions. A DELETE marks tuples dead; it does not shrink the relation and does
  // not, on its own, let Postgres reuse the space. `pg_total_relation_size` is
  // therefore unchanged immediately after a large prune, which reads as "the prune
  // did nothing" when in fact it did all of it.
  //
  // What actually unblocks writes is a plain VACUUM: it makes the dead space
  // reusable *inside* the existing pages, so Postgres stops needing to extend the
  // file — and "could not extend file" is the exact error a full project throws.
  // The file stays the same size; that is fine and is not what the write path cares
  // about.
  const dead = await db.execute(sql`
    SELECT relname AS name,
           n_live_tup::bigint AS live,
           n_dead_tup::bigint AS dead,
           last_vacuum,
           last_autovacuum
    FROM pg_stat_user_tables
    WHERE relname IN ('weather_runs', 'weather_run_hours', 'weather_ensemble_hours')
    ORDER BY n_dead_tup DESC
  `)

  let totalDead = 0
  console.log('  Dead tuples awaiting vacuum:')
  for (const d of dead.rows as Row[]) {
    totalDead += num(d['dead'])
    const vac = d['last_vacuum'] ?? d['last_autovacuum']
    console.log(
      `    ${str(d['name']).padEnd(26)} ${str(d['dead']).padStart(9)} dead / ${str(d['live']).padStart(9)} live   last vacuum ${ago(vac)}`,
    )
  }
  console.log('')

  if (totalDead > 10_000) {
    console.log('  ** Space has been freed logically but not yet made reusable. **')
    console.log('  A DELETE does not shrink a relation and the size above will not move.')
    console.log('  Run this, then re-check — plain VACUUM, never VACUUM FULL, which')
    console.log('  rewrites each table and needs as much free space as the table itself:')
    console.log('')
    console.log('    VACUUM (ANALYZE) weather_runs, weather_run_hours, weather_ensemble_hours;')
    console.log('')
    console.log('  Autovacuum will get there on its own, but it is throttled.')
  } else if (totalMb > 460) {
    console.log('  ** Near the cap with little dead space — pruning will not help. **')
    console.log('  Either fewer stored hours per run, or a larger plan.')
  }
  console.log('')
}

run().catch((err: unknown) => {
  console.error('check:runs-storage threw:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
