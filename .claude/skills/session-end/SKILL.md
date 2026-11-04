---
name: session-end
description: Ending a work session — rewrite STATE.md, append the permanent record to session-archive.md, and reconcile the docs the session made stale. Invoke when wrapping up a session or asked to record what was built.
---

# Session End Protocol

`STATE.md` is the present and is read at every session start. `session-archive.md` is the
past and is only grepped. Keep each fact in the one that matches it.

## 1. Rewrite `.claude/docs/STATE.md`

**Replace** the stale parts rather than appending: a gotcha that stopped being true is
deleted, a changed direction is rewritten. Keep it **under 6,000 characters.** The
SessionStart hook keeps its whole injection under Claude Code's 10,000-character cap and
truncates STATE.md to fit. If it grows past that, something in it is history and belongs in
the archive.

## 2. Append a block to `.claude/docs/session-archive.md`

Append; never prepend. **Never Read or Edit the archive to append to it.** It is over 400 KB,
and the Edit tool reads the whole file first. Write the block to a scratch file with the
Write tool, then append it from the shell:

```bash
cat <scratch-file> >> .claude/docs/session-archive.md
```
```powershell
Get-Content <scratch-file> -Raw | Add-Content .claude/docs/session-archive.md -NoNewline
```

Check the result with `tail -n 30` (or `Get-Content -Tail 30`), not a Read. Use this format:

```
---

## YYYY-MM-DD — <short title>

**Merged:** #<PR> — <squash commit on main> (one line per PR; "none" if nothing merged)

**What changed:**
- <file or feature> — <one-line description>

**Decisions:** <owner decisions made this session, dated, with the reason; omit if none>

**Left open:** <unfinished work, open PRs, deferred findings, issues filed; omit if none>

**Gotchas:** <non-obvious details not captured in a rule file or handoff; omit if none>

**Does the user need to do anything?** <Yes/No, then the specific actions only they can do — a credential, a dashboard setting, a phone, a product decision.>
```

Record the squash commit on `main`, not the branch commit, which the squash erases. If the
PR has not merged yet, write its number and fix the hash after the merge. A block with no
content beyond a date is noise; do not append one.

## 3. Reconcile the docs the session made stale

The files agents are *told to read* must not contradict what shipped. A stale rule is worse
than a missing one, because an agent obeying it refuses correct work. Grep for every
reference to what you changed and fix each one:
- A phase marked complete in the handoff that owns it, such as `miniapp-design-v1.md`
  or `wall-a-sun-shade-v1.md`.
- A new external API is added to `.claude/docs/api-sources.md`.
- A new invariant future work must uphold goes in the `.claude/rules/` file scoped to the
  paths it governs (`architecture.md` only if it holds everywhere; its index lists the rest), and as a
  checkbox in the `/review-checklist` skill if it can rot silently.
- **Specs written in the future tense get a status banner once built**, rather than being
  left to read as unbuilt work.
- Anything a doc says is missing, broken, or "does not exist yet" that now exists.

## 4. Prefer deleting a copy to maintaining it

Before adding a fact to a second document, ask whether the first can be **read** instead.
Issue state is `gh issue list`, never a table in a doc, for this reason.
