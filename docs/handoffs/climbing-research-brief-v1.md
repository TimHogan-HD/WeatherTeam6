# WeatherTeam6: Climbing & Rock Research Brief
Version: v1
Date: 2026-09-16
Status: Ready for Handoff

## Context

Two research documents exist and both were produced in a cloud session whose egress proxy
blocked every content domain — so every published figure in them came from a search-result
summary rather than the source. This brief is for a session run **locally on the Windows
laptop**, where that ceiling does not apply, to deepen the rock and climbing knowledge the
drying model and conditions score depend on.

## Current State

**What exists and is merged:**

- `.claude/docs/rock-drying-research.md` — ~2,700 lines, 25 passes. Rock physics, ~65 crags,
  drying/absorption by family, gap analysis against `dryingModel.ts`, competitor survey.
  Merged to `main` as `48ea8a8`.

**What exists and is NOT merged:**

- `.claude/docs/climbing-terminology-research.md` — ~545 lines. Wall angles, disciplines,
  dew point, closures, location structure. **Open on PR #125.**
- Basalt split into `basalt_dense` / `basalt_vesicular`. **Open on PR #124**, and its
  migration `0011` is generated but **not applied** — Neon is unreachable from the cloud.

**What is broken or unverified:**

- Every published number in both docs is attributed but **not read at source**.
- Nothing has been verified against live Open-Meteo or the database.
- Both docs carry confidence markers: **[M]** measured, **[S]** stone-industry,
  **[C]** community, **[R]** read from this repo, **[?]** inference. That convention works —
  keep it.

## Objective

Raise the **evidence grade** of what is already written, and fill the named gaps, in two
areas:

1. **Rock** — verify the figures destined to become constants, and get crag-level facts into
   a queryable form.
2. **Climbing** — capture how climbers actually decide, in their own words, and the
   per-crag/per-discipline facts no weather model can derive.

Success is not more prose. Success is **[M]/[C] claims that survive being read at source**,
plus a data file of per-crag facts.

## Constraints / Non-Goals

- **Do not change `scoring-algorithm.md`.** It is locked. Findings go in docs; constants
  change only with the owner's explicit approval.
- **Do not implement anything.** No code, no migrations, no schema. This is research.
- **Do not rewrite the two existing docs wholesale.** Append, correct, and mark superseded —
  the rock doc's status-banner pattern is the precedent.
- **Do not merge PR #124 or #125** as part of this work.
- **Out of scope:** UI recommendations. The Mini App changed substantially between the rock
  doc being written and merged, which is exactly why its §9 needed a superseded banner. Do
  not write new recommendations against a UI that is still moving.

## Pre-Implementation Checklist

- [ ] Confirm you are running **locally on Windows**, not in a cloud session. Check
      `HTTPS_PROXY` is unset and `curl -sS -o /dev/null -w "%{http_code}" https://en.wikipedia.org/`
      returns `200`. If it returns `000`, you are in the sandbox and this brief does not apply.
- [ ] Read both existing docs before searching. Their "what I could not establish" sections
      are the backlog — do not re-derive what is already there.
- [ ] Confirm PR #124 and #125 status; if either merged, the docs on `main` are newer than
      what this brief describes.
- [ ] `npm run build --workspace=packages/types --workspace=packages/design` before any
      typecheck (Windows gotcha: shared packages must be built first).
- [ ] Windows gotchas from `CLAUDE.md`: working tree is **CRLF**, so multi-line `sed`/`perl`
      silently match nothing — use the edit tools. **Python is not installed.** `gh` is at
      `C:\Program Files\GitHub CLI\gh.exe`, not always on PATH.

## Phases

### Phase 0: Verify the environment and set up capture

**What to do:**
- Run the egress check above. Record the result in the session notes.
- Create `.claude/research-inbox/` with a `README.md` explaining it holds raw source material
  (transcripts, saved articles, PDFs) that is read rather than fetched. Add it to
  `.gitignore` if the material is large or copyrighted — **do not commit third-party article
  text**; commit only citations and extracted claims.

**Acceptance criteria:** `curl https://en.wikipedia.org/` returns 200, and the inbox exists
with a README stating the do-not-commit rule.

**Git checkpoint:** commit the inbox README and `.gitignore` entry.

---

### Phase 1: Verify the figures that are headed for constants

The highest-value work, because these numbers may end up in `dryingModel.ts`.

**What to verify at source** (all currently **[M]**/**[S]** from summaries only):

| Claim | Where | Currently cited as |
| --- | --- | --- |
| Sandstone strength loss 0–55%, outliers >90%, most across 60–80% saturation | rock §2.4 | Springer / Elsevier / OUP GJI |
| Navajo Sandstone ~28% porosity; facies 100 mD → 0.265 mD | rock §4.1 | petrophysics compilations |
| Porosity/absorption table by family | rock §3 | Liverpool + Leeds tables, ASTM C97 |
| Freeze–thaw: water content +15.6–60%, strength −7.3–38% | rock §2.6 | Scientific Reports ×2 |
| Sorption isotherm Type II, regime break ~75% RH | rock §2.8 | Keppert et al., Krus & Kießl |
| Granite absorption 0.34%, albite/grain-size trend | rock §4.17 | NIH PMC |
| Snow-to-liquid ratio 3:1–40:1 | rock §2.7 | NWS |
| Access Fund 24–48h / up to a week | rock §6.11 | accessfund.org (was EGRESS_BLOCKED) |
| Steepness bands slab ≤88 / vert 88–95 / OH 95–165 / roof ≥165 | terminology §1.1 | Springer |
| Dew point >60 °F = poor conditions | terminology §10 | UKC, Plas y Brenin |
| Ideal bouldering 0–10 °C; rubber max friction 0–5 °C | terminology §9 | Climbing, Friction Labs |

**For each:** open the primary source, confirm the number and its conditions, and record
whether it **confirms**, **corrects**, or **cannot be found**. A figure that cannot be
verified gets downgraded, not deleted — say so inline.

**Acceptance criteria:** every row above carries a verdict and, where confirmed, a direct
quote plus the page/section. Any corrected figure is fixed in place with a dated note.

**Git checkpoint:** one commit, `docs: verify rock figures at source`.

---

### Phase 2: Per-crag facts as data, not prose

The rock doc's ~65 crags are prose. Prose cannot seed a flag.

**What to build:** `.claude/docs/crag-facts.json` — one object per crag, extracted from the
existing docs first, then extended with new research.

**Acceptance criteria:** at least the ~65 crags already covered are present, every field
carries a `source` and `confidence`, and unknown fields are `null` rather than guessed.
A crag with no seepage information has `seepage_prone: null`, never `false`.

**Git checkpoint:** `docs: crag facts as structured data`.

---

### Phase 3: Climbing decision knowledge — the part only speech carries

**Target the sources that were unreachable:** podcasts, YouTube, long forum threads.

**Questions to answer** (these are product knowledge, not physics):

1. What does a climber check the night before, and in what order?
2. What makes someone turn around *at* the crag — and is it the wall or the approach?
3. What words do they use for conditions they'd act on? (register for our copy, and the
   label set for a "was it dry?" report)
4. How do bouldering, sport, trad, multi-pitch and ice differ in what they check?
5. Which crags do locals treat as the wet-weather backup, and why?

**Suggested sources:** The Nugget Climbing Podcast, Careless Talk, Power Company, UKC and
ukbouldering forum threads on conditions, regional Facebook/Discord groups for MN/WI/CO/SD/WY,
YouTube channels covering the user's home crags.

**Method:** paste transcripts into `.claude/research-inbox/`, read them as files, extract
claims. **Do not commit the transcripts** — commit only the extracted claims with attribution.

**Acceptance criteria:** a new section in the terminology doc with at least the five questions
answered and every claim carrying a source and **[C]** marker. Vocabulary additions land in a
form the bot/Mini App copy could use directly.

**Git checkpoint:** `docs: how climbers actually decide`.

---

### Phase 4: Close the named gaps

Work the existing backlog. These are already written down — start here, not from zero.

**From rock §8:**
- No measured drying-rate data for any real crag. Does *any* exist? (Saxony study, Felsampel
  sensor data, university weathering stations, stone-conservation literature)
- How long does a dry wall stay greasy after a humid night? The number a user actually wants.
- Vertical variation within one cliff (the Nuttall result).
- Millstone Grit 41% and "western sandstone" 75% — find the primary sources or downgrade them.

**From terminology §16:**
- **How much does an overhang reduce wetting?** All current evidence is categorical. This is
  the biggest single unknown, and it gates whether angle can ever be a real model input.
- **Is temperature or humidity dominant for skin friction?** Contested, and it would change
  the score's component weights if settled.
- How do bouldering landings dry? Nothing found at all.
- Are seasonal closure schedules published anywhere machine-readable?

**Acceptance criteria:** each gap is either closed with sourced evidence, or restated more
precisely with what was searched and why it failed. "Still open" is an acceptable and useful
outcome; silence is not.

**Git checkpoint:** `docs: close research gaps`.

---

### Phase 5: Reconcile and hand back

**What to do:**
- Re-check every **[R]** claim in both docs against current `main` — they were verified at
  `48ea8a8` and `main` moves fast.
- Mark anything superseded with a dated banner rather than deleting it.
- Update `CLAUDE.md`'s Reference Docs lines if the docs' scope changed.
- Open one PR per phase where feasible; otherwise one PR with the phase commits intact.

**Acceptance criteria:** CI green, no doc claims something is missing that now exists, and the
handoff block states plainly what was verified at source and what was not.

## Data Shapes / Schemas

`.claude/docs/crag-facts.json` — proposed, adjust in Phase 2 if it fights the data:

```jsonc
{
  "crags": [
    {
      "name": "Red Wing",
      "state": "MN",
      "rock": {
        "family": "dolomite",            // free text; maps to RockType later, not now
        "formation": "Oneota Dolomite",
        "note": "cherty, bedded, crimpy — climbs the cap, not the sandstone below",
        "source": "rock-drying-research.md §4.7",
        "confidence": "C"
      },
      "seepage_prone": null,              // null = unknown. NEVER false-by-default.
      "water_features": null,             // tufa/stalactites — sufficient, not necessary (§4.16)
      "shelter": null,                    // overhang/roof that keeps rain off
      "aspect": null,
      "approach_hazard": null,            // river crossing, snowmelt, wading
      "closure": {                        // §13 — raptor and seasonal closures
        "months": null,
        "reason": null,
        "source": null
      },
      "disciplines": ["sport", "trad"],   // §8 — ice venues invert the model
      "dries_fast_relative_to": null,     // local ranking, e.g. "faster than Barn Bluff"
      "sources": []
    }
  ]
}
```

**Rules for the file:**
- `null` means unknown and must never render as a favourable value (`defect-patterns.md` §1).
- Every non-null fact carries a source and a confidence marker.
- This is **research data, not a schema**. It does not imply a migration.

## Known Risks / Watch Points

- **Paywalls.** Springer, Elsevier and ScienceDirect articles are often abstract-only. An
  abstract confirming a number is better than a summary, but say which you read.
- **Copyright.** Do not commit article or transcript text. Commit claims, quotes short enough
  to be fair use, and citations.
- **The rock doc is long.** Appending without structure will make it unusable. Prefer a new
  section with a clear heading over interleaving.
- **Community sources conflict, and that is data.** The angle conventions in terminology §1
  contradict each other; recording the conflict was more valuable than picking a winner.
- **Do not let verification become re-research.** If a figure confirms, note it and move on.
- **`main` moves fast.** Between the rock doc being written and merged, 46 commits landed and
  its §9.5 went stale. Re-check **[R]** claims late (Phase 5), not early.

## Open Questions

1. **Should `crag-facts.json` be committed, or does it belong outside the repo?** It will grow,
   and it is derived from third-party guidebooks and forums. My read: commit it — the facts are
   ours, the sources are cited, and it is small compared to the docs.
2. **Is there an appetite for route- or wall-level facts**, or is per-crag the right grain?
   Terminology §12 notes the real hierarchy is recursive and ours is flat.
3. **Do you want the two research docs kept separate or merged?** They overlap on shelter,
   friction and seepage. Separate is currently working.
4. **Which regions matter most?** The rock doc weighted MN/CO/WI/SD/WY on your instruction.
   Confirm that still holds for the climbing-knowledge phases.
