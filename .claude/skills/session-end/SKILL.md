---
name: session-end
description: Ending a work session — rewrite STATE.md, append the permanent record to session-archive.md, and reconcile the docs the session made stale. Invoke when wrapping up a session or asked to record what was built.
---

# Session End Protocol

Two files, and they do different jobs. Getting this backwards is what produced a 165KB
document that was mandatory reading.

## 1. Rewrite `.claude/docs/STATE.md`

It describes the project *now*. You **replace** the stale parts rather than appending — if a
gotcha stopped being true, delete it; if the direction changed, rewrite it. There is exactly
one current version by construction, so it cannot develop the two-ends-newest ordering
problem the old log had. Keep it short enough to be read at every session start: if it is
growing past ~1,500 words, something in it is history and belongs in the archive.

## 2. Append a full state block to `.claude/docs/session-archive.md`

This is the permanent record and is **never read at session start** — it is grepped when
someone needs the reasoning behind one specific past decision. Append; never prepend. Use
this exact format:

```
---

## YYYY-MM-DD — branch: <branch> — commit: <short-hash>

**Phase completed:** <phase name and number>

**What was built this session:**
- <file or feature> — <one-line description>
- ...

**Known issues / deferred work:**
- <anything left incomplete, version mismatches noticed, TODOs punted>

**Blockers for next session:**
- <anything the next session must resolve before proceeding>

**What's next:** Phase <n> — `git checkout -b phase/<n>-<name>` off `<base branch>` — read `<handoff doc path and section>` before writing any UI

**Gotchas for next session:**
- <cross-file dependency, ordering constraint, spec gap, or non-obvious detail not captured in the plan or handoff docs>
- None if nothing to flag

**Does the user need to do anything?** <Yes/No, then the specific actions only they can do — a credential, a dashboard setting, a phone, a product decision. "No" is a valid and useful answer; never manufacture one.>
```

Stub entries (timestamps only, no content) are noise — never append a session-end line
without the full block above.

## 3. Reconcile the docs the block just made stale

The session block is a record, not a substitute — the files agents are *told to read* must
not contradict what shipped. Before ending, grep for every reference to what you changed and
fix each one:

- A completed task is marked complete **in both places the task list lives** —
  `docs/handoffs/telegram-crossover-v4.md` (the canonical list) and `.claude/docs/plan.md`
  (the same list with detail). A task recorded in only one of them is effectively unfindable
  in the other.
- A new endpoint is added to the inventory in
  `docs/handoffs/weatherteam6-miniapp-handoff-v1.md`.
- A new external API is added to `.claude/docs/api-sources.md`.
- A new invariant future work must uphold goes in `.claude/rules/architecture.md`, and as a
  checkbox in the `/review-checklist` skill if it can rot silently.
- **Specs written in the future tense get a status banner once built**, rather than being
  left to read as unbuilt work.
- Anything a doc says is missing, broken, or "does not exist yet" that now exists.

This is not tidying. A stale rule is worse than a missing one: "Two screens only — do not let
them creep back in" survived three weeks past the spec that added a third screen, and any
agent obeying it would have refused to build a feature that was already specified and whose
API was already merged.

## 4. But prefer deleting the copy to maintaining it

Every item above is a place a fact has to be mirrored by hand, and hand-mirroring is what
failed: 66% of one thirty-commit stretch was documentation repairing other documentation, and
the most recent one — titled *"record the corrected issue state"* — touched one file and left
`plan.md` wrong. Before adding a fact to a second document, ask whether the first can simply
be **read** instead. Issue state is now `gh issue list` for exactly this reason. A fact that
lives in one place cannot drift.

## 5. After a squash merge, correct the commit hash in the block you just wrote

The branch commit it names ceases to exist; record the squashed hash on `main` instead.
