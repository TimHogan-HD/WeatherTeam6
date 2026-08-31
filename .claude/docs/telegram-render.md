# Telegram rendering — what the clients actually do

Probe B of Phase 0 in `.claude/docs/telegram-precision-interface-plan.md`. **Every
rendering constant in a later phase traces to a line in this file.**

Two halves, and they are not equally settled:

- **§1 The API surface** is verified against Telegram's own reference and changelog
  (read 2026-08-31). It is finished.
- **§2 Observations** is the half only a human with the clients in front of them can
  fill in. Run 1 (2026-08-31) covered **phone and desktop**; **web is still unobserved**,
  and web is the client the unverified claim is about.

**`<pre>` monospace still ships first.** Rich tables cleared both clients tested,
including surviving an in-place edit, but promoting them to primary needs web — one
tab, four specimens. The rich upgrade is gated on that, not on the API existing.

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

**Run 1 — 2026-08-31. All ten specimens accepted by the API; nothing was rejected.**
Phone and desktop observed. **Web has not been looked at**, and it is the client the
unverified claim is about, so the primary-rendering decision is not made yet.

| # | Specimen | Phone | Desktop | Web |
| --- | --- | --- | --- | --- |
| 1 | `<pre>` monospace table (the fallback) | Code block, columns aligned, `COPY CODE` affordance | Code block, columns aligned, copy header | — |
| 2 | `RichBlockTable`, bordered + striped + compact | **Real table.** Grid lines, caption centred above it, fits the width | **Real table**, same | — |
| 3 | `RichBlockTable`, no styling flags | Table, no grid lines, roomier rows — the flags do something | Same | — |
| 4 | Expandable blockquote | Collapsed by default, chevron to expand, text fades at the cut | Collapsed, chevron, `credit` shown as a link-coloured line | — |
| 5 | Inline keyboard with a `DisabledButton` | **Identical to the enabled buttons.** No greying, no visual difference at all | **Identical.** Same | — |
| 6 | Rich table, before edit | Table | Table | — |
| 7 | The same message after `editMessageText` | **Still a table.** Same message id, values changed, layout intact | **Still a table** | — |
| 8a | `&` and `<>` unescaped in a rich block | `Bear & Cub <north face>` intact in the paragraph, `Bear & Cub` intact in the cell | Intact | — |
| 8b | The same characters through the `<pre>` path | Correct inside the code block | Correct | — |
| 9 | Nine-column table (worst-case width) | **Fits.** `HH temp dew RH wind gust dir cld pop` on one row, no wrap, no scroll | Fits | — |

Builds were not recorded. Rich Messages are weeks old, so a future contradiction is more
likely to be a version difference than a mistake here — record the build next run.

### What run 1 settled

- **Rich tables render, and they survive an in-place edit.** Specimen 7 is the same
  message id as 6, re-rendered as a table with new values on both clients. The
  second-hand claim that editing destroys rich formatting is **false** for phone and
  desktop. It says nothing about web yet.
- **`DisabledButton` is accepted by the API and invisible in the UI.** HRRR looks exactly
  like GFS and ECMWF on both clients. It therefore **cannot carry "HRRR exists and does
  not reach here"** — the reason the plan chose it over omitting the button. Phase 1 must
  say it in text instead; see the decision rules below. Whether the button is *inert* when
  tapped is untested and does not change this: a control that looks tappable and does
  nothing is worse than a labelled row, not better.
- **Rich blocks need no HTML escaping.** `&` and `<>` passed through unaltered — blocks
  are structured JSON, not markup. **The `<pre>` path still needs `escapeTelegramHtml`.**
  Two paths, two rules, and mixing them up is a 400 the webhook swallows.
- **Width is not the constraint it was assumed to be.** Nine columns fit on the phone
  with no wrapping and no horizontal scroll. Phase 3's column sets are not forced down to
  five by the device.
- **The `<pre>` fallback renders correctly on both clients**, columns aligned, so nothing
  about shipping it first is in doubt.

### The web column stays empty, by decision

**The user declined the web check on 2026-08-31.** That is a settled answer, not a task
waiting to be picked up — do not re-raise it.

So the decision it was gating goes the conservative way: **`<pre>` monospace is the
rendering, and rich tables are not adopted.** They cleared phone and desktop, edit
included, but adopting them would assert something about a client nobody has looked at —
the same "attribution not backed by the data" this repo keeps shipping. The evidence for
them is real and recorded above; it is simply not complete, and incomplete is not a
licence.

Reopening it costs one browser tab: `npm run probe:telegram-render --workspace=apps/api`
re-sends the specimens, and the Web column above is waiting.

### What each outcome means for the build

| If | Then |
| --- | --- |
| Specimens 2, 3, 6 **and** 7 render as tables on all three clients | The claims are wrong. Rich tables become the primary rendering; delete the warning box from the plan and record the client versions here. |
| 2 and 3 render but 7 degrades after the edit | Rich tables are usable only for messages that are never edited. The panel is edited in place, so the panel stays `<pre>` — a split worth stating rather than discovering later. |
| Web shows an unsupported card | `<pre>` for everything. A panel that is unreadable on one of the owner's own clients is not a panel. |
| Specimen 5's button is not visibly disabled | Fall back to a labelled non-button row naming the model and why it is unavailable — **never** to omitting it (defect class 3). **Run 1 hit this**: HRRR was indistinguishable from GFS on both clients, so Phase 1 builds the labelled row and does not use `disabled`. |
| Specimen 8a is rejected | Rich blocks need the same escaping as HTML. Escape literal strings too: `/start` has been dead since it was written over exactly this. |

Nothing in §2 may be summarised as "works" from an API acceptance. The script reports
what Telegram accepted; only the table above reports what a person saw.
