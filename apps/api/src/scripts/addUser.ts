/**
 * Create a user, or reset an existing user's passphrase.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run user:add -- --username tim --name "Tim"          # prompts, hidden
 *   npm run user:add -- --username kim --generate            # mints one, prints it once
 *   $env:NEW_USER_PASSPHRASE = "..."; npm run user:add -- --username kim
 *
 * **The owner is `--user-id`, not a new row.** Every saved location belongs to
 * `DEFAULT_USER_ID`, and `locations.user_id` scopes every list, so creating a
 * fresh row for the owner would log them into an empty app with their crags
 * still attached to a user that has no way to sign in. Give the *existing* row
 * a username instead:
 *
 *   npm run user:add -- --username tim --user-id 00000000-0000-0000-0000-000000000001
 *
 * **This is the whole signup flow, and there should not be another one.** The
 * product is the owner plus a few climbing partners; adding one is an operator
 * action, deliberately.
 *
 * Passphrase strength is the real control. There is no rate limiting on
 * `POST /api/v1/auth/login` — no Redis, no store for counters — so scrypt's cost
 * and a fixed failure delay are all that stand between a weak passphrase and a
 * guessing loop. `--generate` exists so the easy path is also the strong one.
 *
 * Re-running for an existing username resets that user's passphrase in place;
 * it does not create a second row. Existing tokens for that user keep working —
 * there is no revocation (see `lib/auth/token.ts`).
 *
 * console rather than the logger is deliberate — this is an operator-facing CLI,
 * same as `checkAddLocationApi.ts`, and its output is the result.
 */

import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'
import { PassThrough } from 'node:stream'

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset, which would pre-empt the explanation below
// with a stack trace.

/** Four words from a 2048-word list would be better; this is the same entropy without the list. */
function generatePassphrase(): string {
  return randomBytes(18).toString('base64url')
}

type Args = {
  username: string | null
  name: string | null
  /** An existing `users.id` to give credentials to, rather than inserting a row. */
  userId: string | null
  generate: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { username: null, name: null, userId: null, generate: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--generate') {
      args.generate = true
    } else if (flag === '--username' || flag === '--name' || flag === '--user-id') {
      const value = argv[i + 1]
      // A flag with no value must not silently consume the next flag as its
      // argument — `--username --generate` would create a user called
      // "--generate" and look like it worked.
      if (value === undefined || value.startsWith('--')) continue
      if (flag === '--username') args.username = value
      else if (flag === '--name') args.name = value
      else args.userId = value
      i++
    }
  }
  return args
}

/**
 * Prompt without echoing.
 *
 * **`readline` never writes to the terminal here** — its output goes to a sink
 * that is thrown away, and the prompt is written to stdout directly. Editing
 * still works because `terminal: true` keeps stdin in raw mode; only the echo
 * is discarded.
 *
 * The obvious implementation — override `_writeToOutput` and let the prompt
 * through — **leaks the passphrase**, and was caught in review. On backspace,
 * Ctrl-U or a line wrap, readline calls its refresh path, which writes
 * `prompt + line-so-far` as a *single* chunk; a guard keyed on the prompt being
 * present therefore passes and prints what has been typed. The trailing newline
 * does not clear it, so it stays in scrollback after the process exits. One
 * backspace is enough. Verified against Node 24 by driving a fake TTY.
 *
 * Discarding the whole stream is immune to that, and to whatever readline's
 * private hooks do next — `_writeToOutput` is undocumented.
 */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const sink = new PassThrough()
    sink.resume()
    const rl = createInterface({ input: process.stdin, output: sink, terminal: true })
    process.stdout.write(question)
    rl.question('', (answer) => {
      rl.close()
      sink.end()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

async function resolvePassphrase(generate: boolean): Promise<{ value: string; shown: boolean }> {
  if (generate) return { value: generatePassphrase(), shown: true }

  const fromEnv = process.env['NEW_USER_PASSPHRASE']
  if (fromEnv !== undefined && fromEnv !== '') return { value: fromEnv, shown: false }

  if (!process.stdin.isTTY) {
    console.error(
      '\nNo passphrase. Pass --generate, set NEW_USER_PASSPHRASE, or run this from a terminal.\n',
    )
    process.exit(2)
  }

  const first = await promptHidden('Passphrase: ')
  const second = await promptHidden('Repeat:     ')
  if (first !== second) {
    console.error('\nThose did not match. Nothing was written.\n')
    process.exit(2)
  }
  return { value: first, shown: false }
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error(
      '\nMissing DATABASE_URL — the Neon pooled connection string.' +
        '\nNeon dashboard > project > Connect. Vercel will not reveal its copy.\n',
    )
    process.exit(2)
  }

  const args = parseArgs(process.argv.slice(2))
  if (args.username === null || args.username.trim() === '') {
    console.error(
      '\nUsage: npm run user:add -- --username <name> [--name "Display Name"]' +
        '\n                          [--user-id <uuid>] [--generate]' +
        '\n\n  --user-id gives an EXISTING user a login instead of creating a row.' +
        '\n  Use it for the owner: their saved locations belong to DEFAULT_USER_ID.\n',
    )
    process.exit(2)
  }
  const username = args.username.trim()

  const { isUuid } = await import('../lib/http.js')
  if (args.userId !== null && !isUuid(args.userId)) {
    // Postgres answers a malformed uuid with a 22P02 that surfaces as a stack
    // trace. Say what is wrong instead.
    console.error(`\n"${args.userId}" is not a uuid.\n`)
    process.exit(2)
  }

  const { value: passphrase, shown } = await resolvePassphrase(args.generate)
  if (passphrase.length < 12) {
    console.error(
      `\nThat passphrase is ${String(passphrase.length)} characters. There is no rate limiting on` +
        '\nthe login route, so length is the defence. Use at least 12, or --generate.\n',
    )
    process.exit(2)
  }

  const { hashPassword } = await import('../lib/auth/password.js')
  const { db, pool } = await import('../db/index.js')
  const { users } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')

  try {
    const password_hash = await hashPassword(passphrase)

    if (args.userId !== null) {
      // Give an existing row a login. This is the owner's path.
      const target = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, args.userId))
        .limit(1)
      const row = target[0]
      if (!row) {
        console.error(`\nNo user with id ${args.userId}. Nothing was written.\n`)
        process.exit(2)
      }

      // `username` is unique. Catching the collision here gives a sentence
      // instead of a driver error, and leaves the row untouched either way.
      const clash = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1)
      const other = clash[0]
      if (other && other.id !== row.id) {
        console.error(`\n"${username}" is already taken by ${other.id}. Nothing was written.\n`)
        process.exit(2)
      }

      await db
        .update(users)
        .set({ username, password_hash, ...(args.name === null ? {} : { name: args.name })})
        .where(eq(users.id, row.id))
      console.log(
        row.username === null
          ? `\nGave ${row.id} the username "${username}". Their existing locations are unchanged.`
          : `\nUpdated ${row.id}: username "${row.username}" → "${username}", passphrase reset.`,
      )
      if (shown) {
        console.log(`\n  Passphrase: ${passphrase}`)
        console.log('  This is the only time it is shown. It is not recoverable — only resettable.\n')
      } else {
        console.log('')
      }
      return
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1)

    const found = existing[0]
    if (found) {
      await db.update(users).set({ password_hash }).where(eq(users.id, found.id))
      console.log(`\nReset the passphrase for "${username}" (${found.id}).`)
      console.log('Existing session tokens for that user keep working — there is no revocation.')
    } else {
      const inserted = await db
        .insert(users)
        .values({ username, password_hash, ...(args.name === null ? {} : { name: args.name }) })
        .returning({ id: users.id })
      const id = inserted[0]?.id
      if (id === undefined) throw new Error('the insert returned no row')
      console.log(`\nCreated user "${username}" (${id}).`)
      console.log('Their locations start empty — each user curates their own list.')
    }

    if (shown) {
      console.log(`\n  Passphrase: ${passphrase}`)
      console.log('  This is the only time it is shown. It is not recoverable — only resettable.\n')
    } else {
      console.log('')
    }
  } finally {
    await pool.end()
  }
}

run().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
