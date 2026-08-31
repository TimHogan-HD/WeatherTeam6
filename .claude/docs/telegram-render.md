# Telegram rendering — what the clients actually do

Probe B of Phase 0 in `.claude/docs/telegram-precision-interface-plan.md`. **Every
rendering constant in a later phase traces to a line in this file.**

Two halves, and they are not equally settled:

- **§1 The API surface** is verified against Telegram's own reference and changelog
  (read 2026-08-31). It is finished.
- **§2 Observations** is the half only a human with three clients can fill in. It is
  **empty** until `npm run probe:telegram-render --workspace=apps/api` has been run
  and the chat looked at on a phone, a desktop client and web.telegram.org.

Until §2 is filled, **`<pre>` monospace is what ships**, which is what the plan says
anyway. The rich upgrade is gated on the observations, not on the API existing.

---

## 1. The API surface, verified

Source: [Bot API reference](https://core.telegram.org/bots/api) and
[changelog](https://core.telegram.org/bots/api-changelog), read 2026-08-31.

| Thing | Verified as | Since |
| --- | --- | --- |
| `sendRichMessage` | `chat_id` + `rich_message: InputRichMessage` (required), plus the usual `reply_markup`, `reply_parameters`, `disable_notification` | 10.1 (11 Jun 2026) |
| `InputRichMessage` | **Exactly one** of `blocks`, `html`, `markdown`. Also `media`, `is_rtl`, `skip_entity_detection` | 10.1, `blocks` added 10.2 |
| `InputRichBlockTable` | `type: "table"`, `cells: Array of Array of RichBlockTableCell`, optional `is_bordered`, `is_striped`, `is_compact`, `caption: RichText` | 10.2; `is_compact` 10.3 |
| `RichBlockTableCell` | `text: RichText` *(optional — omitted means an invisible cell)*, `is_header`, `colspan`, `rowspan`, `align` (`left`/`center`/`right`), `valign` (`top`/`middle`/`bottom`) | 10.1 |
| `RichText` | **May be a plain String.** Also an array of `RichText`, or one of the ~26 `RichText*` types | 10.1 |
| `InputRichBlockExpandableBlockQuotation` | `type: "expandable_blockquote"`, `text: RichText`, optional `credit` | 10.3 (24 Aug 2026) |
| `DisabledButton` | A class that "currently holds no information" — i.e. `{}`. Set as `InlineKeyboardButton.disabled` | 10.3 |
| Editing a rich message | `editMessageText` takes `rich_message: InputRichMessage`, *"required if `text` isn't specified"* | 10.1 |

**What this settles:** the panel-edited-in-place design is not blocked by the API. A
rich message can be sent, given an inline keyboard, and edited in place with new rich
content, and a model with no coverage can be shown as a disabled button rather than
omitted.

**What this does not settle, at all:** what any client draws. The reference describes
requests, not rendering. That is §2.

### The two claims the plan flagged as unverified

Both come from the issue tracker of `NousResearch/hermes-agent`, an LLM-agent project
describing its own integration — not Telegram, not a Telegram client, not a Bot API
library.

1. **"Telegram Web shows an unsupported-message card for rich messages."** Nothing in
   Telegram's documentation confirms or denies it. Specimens 2 and 3 test it directly.
2. **"Editing destroys rich formatting."** Telegram's reference contradicts the strong
   form of it — `editMessageText` explicitly accepts `rich_message` — but that is an
   argument about the API, not about what the client redraws. Specimens 6 and 7 test it.

Neither may be repeated as fact anywhere until §2 says so.

---

## 2. Observations — **not yet made**

Run, from a shell holding the credentials (no `.env` file, and the token must never be
pasted into a conversation):

```powershell
$env:TELEGRAM_BOT_TOKEN = "<from BotFather>"
$env:TELEGRAM_CHAT_ID   = "<the owner's Telegram user id>"
npm run probe:telegram-render --workspace=apps/api
```

It sends nine specimens, prints which ones the API accepted, and prints what to look
for in each. **An API rejection is a finding** — record the status and Telegram's own
`description` verbatim; the script prints them.

Then open the chat on all three clients and fill this in. `—` means "not looked at
yet", which is not the same as "fine".

| # | Specimen | Phone | Desktop | Web |
| --- | --- | --- | --- | --- |
| 1 | `<pre>` monospace table (the fallback) | — | — | — |
| 2 | `RichBlockTable`, bordered + striped + compact | — | — | — |
| 3 | `RichBlockTable`, no styling flags | — | — | — |
| 4 | Expandable blockquote | — | — | — |
| 5 | Inline keyboard with a `DisabledButton` | — | — | — |
| 6 | Rich table, before edit | — | — | — |
| 7 | The same message after `editMessageText` | — | — | — |
| 8a | `&` and `<>` unescaped in a rich block | — | — | — |
| 8b | The same characters through the `<pre>` path | — | — | — |
| 9 | Nine-column table (worst-case width) | — | — | — |

Also record, because later phases need the numbers rather than an impression:

- **Client versions and platforms** actually looked at — a rendering answer is only
  about the builds tested, and Rich Messages are weeks old.
- **The widest table that stays readable on the phone**, in columns. This is the
  constant Phase 3's column sets are chosen against.
- **Whether a wide table scrolls, shrinks or wraps** on the phone. Wrapping is a
  failure: a reflowed table is not a table.
- **Whether the `<pre>` fallback's columns stay aligned** on each client — the whole
  fallback depends on a monospace font actually being monospace.

### What each outcome means for the build

| If | Then |
| --- | --- |
| Specimens 2, 3, 6 **and** 7 render as tables on all three clients | The claims are wrong. Rich tables become the primary rendering; delete the warning box from the plan and record the client versions here. |
| 2 and 3 render but 7 degrades after the edit | Rich tables are usable only for messages that are never edited. The panel is edited in place, so the panel stays `<pre>` — a split worth stating rather than discovering later. |
| Web shows an unsupported card | `<pre>` for everything. A panel that is unreadable on one of the owner's own clients is not a panel. |
| Specimen 5's button is not visibly disabled | Fall back to a labelled non-button row naming the model and why it is unavailable — **never** to omitting it (defect class 3). |
| Specimen 8a is rejected | Rich blocks need the same escaping as HTML. Escape literal strings too: `/start` has been dead since it was written over exactly this. |

Nothing in §2 may be summarised as "works" from an API acceptance. The script reports
what Telegram accepted; only the table above reports what a person saw.
