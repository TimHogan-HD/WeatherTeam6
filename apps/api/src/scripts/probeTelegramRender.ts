/**
 * Probe B — does a Rich Message actually render on this account's clients?
 *
 * Phase 0 of `.claude/docs/telegram-precision-interface-plan.md`. It sends one
 * numbered specimen per question to the configured chat and prints a checklist;
 * the **answers come from looking at a phone, a desktop client and Telegram Web**,
 * and go into the Observations table of `.claude/docs/telegram-render.md`.
 *
 * Why a script rather than a decision from the docs: the plan carries a
 * second-hand claim — sourced only to an unrelated LLM-agent project's issue
 * tracker — that Telegram Web shows an "unsupported message" card instead of
 * degrading, and that editing destroys rich formatting. Both would sink the
 * panel-edited-in-place design. Telegram's own reference says `editMessageText`
 * takes `rich_message`; nothing in it describes client behaviour. Only the real
 * clients can answer that, which is what specimens 6 and 7 are for.
 *
 * The API surface used here is verified against core.telegram.org/bots/api
 * (2026-08-31), not assumed:
 *   - `sendRichMessage(chat_id, rich_message, reply_markup?)`, Bot API 10.1.
 *   - `InputRichMessage` — exactly one of `blocks`, `html`, `markdown`.
 *   - `InputRichBlockTable` — `cells: RichBlockTableCell[][]`, plus optional
 *     `is_bordered`, `is_striped`, `is_compact` (10.3) and a `caption`.
 *   - `RichBlockTableCell` — `text` is a `RichText`, and a `RichText` may be a
 *     plain string. `is_header` marks a header cell.
 *   - `InputRichBlockExpandableBlockQuotation` — type `expandable_blockquote`
 *     (10.3).
 *   - `InlineKeyboardButton.disabled` takes a `DisabledButton`, which "currently
 *     holds no information" — i.e. `{}` (10.3).
 *
 * Usage, from a shell holding the credentials (never a `.env` file):
 *
 *   $env:TELEGRAM_BOT_TOKEN = "…"
 *   $env:TELEGRAM_CHAT_ID   = "…"
 *   npm run probe:telegram-render --workspace=apps/api
 *
 * It writes nothing and stores nothing. Failures are results: a 400 from
 * `sendRichMessage` is an answer to record, not an error to hide.
 */

const API = 'https://api.telegram.org'

type Json = Record<string, unknown>

type CallResult = {
  ok: boolean
  status: number
  /** Telegram's own `description` on a failure — the part worth recording. */
  description?: string
  messageId?: number
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required — set it in the shell, not in a .env file`)
  return value
}

/**
 * One attempt, no retry loop: this is a probe, and a rejection is the finding.
 * Retrying a 400 would only bury it.
 */
async function call(method: string, body: Json): Promise<CallResult> {
  const token = requireEnv('TELEGRAM_BOT_TOKEN')
  // The bot token is in the URL, so a transport failure must not carry its own
  // message out of here: an error that quotes the request would put the token in
  // the console. Only the method name escapes.
  let res: Response
  try {
    res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(`transport failure calling ${method} — no response from Telegram`)
  }
  const parsed = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    description?: string
    result?: { message_id?: number }
  }
  return {
    ok: res.ok && parsed.ok === true,
    status: res.status,
    description: parsed.description,
    messageId: parsed.result?.message_id,
  }
}

/** Telegram rejects an unescaped `<` or `&` with a 400, inside `<pre>` as much as outside. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const HEADER = ['HH', 'temp', 'dew', 'wind', 'cld']
const ROWS = [
  ['12', '95F', '35F', 'SW12g21', '20%'],
  ['15', '103F', '31F', 'SW14g26', '40%'],
  ['18', '98F', '33F', 'S11g19', '70%'],
  // A null in every column: `—` is what a missing reading must look like, and it
  // has to stay distinguishable from `0`.
  ['21', '—', '—', '—', '—'],
]

/** The `<pre>` fallback that ships first regardless of what this probe finds. */
function preTable(): string {
  const widths = HEADER.map((h, i) =>
    Math.max(h.length, ...ROWS.map((r) => (r[i] ?? '').length)),
  )
  const line = (cells: string[]): string =>
    cells.map((c, i) => c.padStart(widths[i] ?? c.length)).join('  ')
  return [line(HEADER), ...ROWS.map(line)].join('\n')
}

function tableCells(): Json[][] {
  return [
    HEADER.map((h) => ({ text: h, is_header: true, align: 'right', valign: 'middle' })),
    ...ROWS.map((row) => row.map((c) => ({ text: c, align: 'right', valign: 'middle' }))),
  ]
}

type Specimen = { n: string; what: string; look_for: string; result: CallResult }

async function main(): Promise<void> {
  const chatId = requireEnv('TELEGRAM_CHAT_ID')
  requireEnv('TELEGRAM_BOT_TOKEN')
  const specimens: Specimen[] = []

  const record = async (
    n: string,
    what: string,
    look_for: string,
    method: string,
    body: Json,
  ): Promise<CallResult> => {
    const result = await call(method, { chat_id: chatId, ...body })
    specimens.push({ n, what, look_for, result })
    console.log(
      `  ${n}. ${what} — ${result.ok ? `sent (message ${result.messageId ?? '?'})` : `REJECTED ${result.status}: ${result.description ?? 'no description'}`}`,
    )
    return result
  }

  console.log('Sending specimens…')

  // 1 — the baseline that ships either way, so every later specimen is judged
  // against something already known to work rather than against a memory of it.
  await record(
    '1',
    '<pre> monospace table (the fallback)',
    'Columns line up on a narrow phone; nothing wraps.',
    'sendMessage',
    {
      text: `<b>1 · pre fallback</b>\n<pre>${escapeHtml(preTable())}</pre>`,
      parse_mode: 'HTML',
    },
  )

  // 2 — the upgrade being evaluated.
  await record(
    '2',
    'RichBlockTable, bordered + striped + compact',
    'A real table on phone, desktop AND WEB. On web especially: a rendered table, or an "unsupported message" card?',
    'sendRichMessage',
    {
      rich_message: {
        blocks: [
          { type: 'paragraph', text: '2 · rich table' },
          {
            type: 'table',
            cells: tableCells(),
            is_bordered: true,
            is_striped: true,
            is_compact: true,
            caption: 'Red Rock · HRRR · 3-hourly',
          },
        ],
      },
    },
  )

  // 3 — the same table with no styling flags, to tell "tables are unsupported"
  // apart from "one of the 10.3 flags is".
  await record(
    '3',
    'RichBlockTable, no styling flags',
    'Renders when 2 did not? Then a 10.3 flag is the problem, not tables.',
    'sendRichMessage',
    {
      rich_message: {
        blocks: [
          { type: 'paragraph', text: '3 · rich table, unstyled' },
          { type: 'table', cells: tableCells() },
        ],
      },
    },
  )

  // 4 — `/insight`'s four sections depend on this collapsing.
  await record(
    '4',
    'Expandable blockquote',
    'Collapsed by default with a way to expand, on all three clients.',
    'sendRichMessage',
    {
      rich_message: {
        blocks: [
          { type: 'paragraph', text: '4 · expandable blockquote' },
          {
            type: 'expandable_blockquote',
            text: 'Model disagreement is largest Saturday afternoon: ECMWF holds the ridge, GFS and ICON break it down. Spread at 15:00 is 9F. This paragraph exists to be long enough that a collapsed state is obvious from an expanded one.',
            credit: 'ensemble · 143 members',
          },
        ],
      },
    },
  )

  // 5 — a model with no coverage is disabled, never omitted. If `disabled` is
  // not honoured the fallback is a labelled non-button row, never silence.
  await record(
    '5',
    'Inline keyboard with a DisabledButton',
    'Is HRRR greyed out and inert, or does it look tappable / vanish? Do not tap GFS or ECMWF — the webhook does not handle callback queries until Phase 1, so a tap just spins.',
    'sendMessage',
    {
      text: '5 · disabled button — HRRR should look present but inert',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'GFS', callback_data: 'probe:gfs' },
            { text: 'HRRR', callback_data: 'probe:hrrr', disabled: {} },
            { text: 'ECMWF', callback_data: 'probe:ecmwf' },
          ],
        ],
      },
    },
  )

  // 6 and 7 — the panel is one message edited in place, so this pair is the
  // probe's real question. 7 edits the rich message sent in 6.
  const six = await record(
    '6',
    'Rich table, to be edited by 7',
    'Note what this looks like before 7 lands.',
    'sendRichMessage',
    {
      rich_message: {
        blocks: [
          { type: 'paragraph', text: '6 · before edit — values should change, layout should not' },
          { type: 'table', cells: tableCells(), is_bordered: true },
        ],
      },
    },
  )

  if (six.ok && six.messageId !== undefined) {
    const edited = tableCells().map((row, i) =>
      i === 0 ? row : row.map((c, j) => (j === 1 ? { ...c, text: '77F' } : c)),
    )
    await record(
      '7',
      'editMessageText with rich_message over specimen 6',
      'THE decisive one: after the edit, is it still a table, or has it collapsed to plain text?',
      'editMessageText',
      {
        message_id: six.messageId,
        rich_message: {
          blocks: [
            { type: 'paragraph', text: '7 · after edit — same message, edited in place' },
            { type: 'table', cells: edited, is_bordered: true },
          ],
        },
      },
    )
  } else {
    console.log('  7. skipped — specimen 6 was not sent, so there is nothing to edit')
  }

  // 8 — literal text needs escaping as much as interpolated text does; `/start`
  // has been dead since it was written over exactly this.
  await record(
    '8a',
    'Ampersand and angle brackets, in both renderings',
    'Both arrive. A 400 here names which path needs escaping.',
    'sendRichMessage',
    {
      rich_message: {
        blocks: [
          { type: 'paragraph', text: '8 · Bear & Cub <north face> — unescaped in a rich block' },
          {
            type: 'table',
            cells: [[{ text: 'Bear & Cub', align: 'left', valign: 'middle' }]],
          },
        ],
      },
    },
  )
  await record(
    '8b',
    'Same characters through the <pre> path',
    'Arrives escaped and readable.',
    'sendMessage',
    { text: `<pre>${escapeHtml('Bear & Cub <north face>')}</pre>`, parse_mode: 'HTML' },
  )

  // 9 — the panel's real width. A table that reflows on a phone is not a table.
  await record(
    '9',
    'Nine-column table (worst case width)',
    'On a phone: does it scroll, shrink, or wrap into unreadability?',
    'sendRichMessage',
    {
      rich_message: {
        blocks: [
          { type: 'paragraph', text: '9 · width stress' },
          {
            type: 'table',
            cells: [
              ['HH', 'temp', 'dew', 'RH', 'wind', 'gust', 'dir', 'cld', 'pop'].map((h) => ({
                text: h,
                is_header: true,
                align: 'right',
                valign: 'middle',
              })),
              ['12', '95F', '35F', '12%', '12', '21', 'SW', '20%', '5%'].map((c) => ({
                text: c,
                align: 'right',
                valign: 'middle',
              })),
            ],
          },
        ],
      },
    },
  )

  const rejected = specimens.filter((s) => !s.result.ok)
  console.log(
    `\n${specimens.length - rejected.length}/${specimens.length} specimens accepted by the API.`,
  )
  if (rejected.length > 0) {
    console.log('Rejected — record these verbatim, they are findings:')
    for (const s of rejected) {
      console.log(`  ${s.n}. ${s.what} → ${s.result.status} ${s.result.description ?? ''}`)
    }
  }

  console.log('\nNow open the chat on a phone, a desktop client and web.telegram.org.')
  console.log('For each specimen, record what each client shows:')
  for (const s of specimens) console.log(`  ${s.n}. ${s.what}\n       ${s.look_for}`)
  console.log('\nThe answers go in the Observations table of .claude/docs/telegram-render.md.')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
