---
name: research-standard
description: The depth and verification standard for research in WeatherTeam6. Use whenever the owner asks to research, investigate, compare options, audit a prompt or CLAUDE.md, evaluate a UI/UX approach, pick a library or tool, or check whether a claim is current, and before writing any recommendation that cites sources. Covers primary-source verification, model and version currency, testing claims against this repo, confidence flags, corrections, time boxes, and where findings are recorded.
---

# Research Standard

Owner, 2026-11-22: research reaches this depth by default, whatever the topic. The worked
example is #633 (agent "maintainer" framing): a first pass from search snippets, then three
rounds of verification that corrected six claims and changed the recommendation.

**Why the depth matters.** Search summaries and secondary write-ups paraphrase, misattribute
and lag behind. In #633 the first pass named the wrong first author, generalised advice Anthropic
scoped to two models, read an adherence figure as a floor when its authors called it
optimistic, and cited a cheating result measured on a model two generations old. Every one was
caught only by reading the source.

## 1. Scope the question

- Write the question as one sentence, and the decision it feeds.
- List the claims the answer will rest on. Each is verified in § 3.

## 2. Find sources, in this order

1. **Primary:** the paper's full text, the vendor's own docs, changelog or system card, the
   spec, the library's source or `npm view`.
2. **Repo evidence:** `git log origin/main` (deepen a shallow clone with
   `git fetch --deepen=2000 origin main`), PR bodies, issues, and running the thing
   (`npm audit`, a `check:*` script, a grep of the code a doc describes).
3. **Secondary:** blogs, aggregators, search-result summaries. Use them to find primaries,
   never as the cited source.

Topic sources:

| Topic | Primary sources |
| --- | --- |
| Prompts, CLAUDE.md, skills, agents | Anthropic's prompting guide and Claude Code docs (`.md` variants), the current model's system card, arXiv full text; OpenAI's Codex docs for a second vendor |
| UI/UX | The repo's design docs and mockups (CLAUDE.md § Reference Docs), WCAG/W3C specs, platform docs (MDN, web.dev), Vercel's Web Interface Guidelines (`web-design-guidelines` skill), screenshots from `check:ui` |
| Libraries, APIs, tooling | Official docs and changelog, `npm view <pkg>`, `npm ls`, the package's source, its issue tracker |
| Security | `npm audit --json`, advisory databases (GHSA, CVE), the repo's own audits (#198, #411), the code path itself |
| Weather and scoring | The rule files and docs in CLAUDE.md § Reference Docs, then the upstream API's own docs |

## 3. Verify every claim the answer rests on

- **Read the source itself.** For a PDF, download it to the scratchpad and run
  `pdftotext -layout`, then grep for the exact numbers. A fetch tool's summary of a truncated
  page is paraphrase: mark it so or re-read it.
- **Check the attribution:** title, first author, date, version (`v1`/`v3`), venue.
- **Check currency:** which model, library or browser version was tested. A result on
  Claude 4.x, Sonnet 4 or GPT-5.x is not a result on the current model; say so. Vendor advice
  is often scoped ("Claude Opus 4.5 and 4.6"); quote the scope.
- **Check direction and caveats:** what the authors say limits their result (sample size,
  synthetic data, whether figures are optimistic or pessimistic), and whether a headline
  number survived their own sensitivity checks.
- **Look for disconfirming evidence** with at least one search phrased against the working
  conclusion. In #633, CapCode contradicted BAITBENCH, and Truthgate overturned it for the current models.
- **Test it against this repo:** does the problem occur here (`git log`, the code, a command)?
  Would the recommendation go green in CI today? In #633, `npm audit` without `--omit=dev`
  would have turned `ci` red on every PR.
- **Distrust tool output too.** `npm audit`'s "fix" for `@vercel/node` was a 26-major
  downgrade; only `npm ls` showed it.

## 4. Report

- Lead with the answer, then the evidence.
- Every factual claim gets a confidence flag (High / Medium / Low) and an inline source.
- Separate fact from inference and say which is which.
- State what was not verified: pages that failed, PDFs not read in full, claims resting on one
  preprint.
- **Correct earlier claims explicitly**, under a "What I got wrong" heading, rather than
  silently revising them.
- Prefer recommendations that leave something checkable (a CI step, a check, a line in the
  PR body) over prose rules. A rule worth adding answers a mistake seen at least twice
  (OpenAI's Codex guidance) or has measured evidence on the current model.
- End with a sources list of the URLs actually read.

## 5. Record

- Findings the owner will revisit go in a GitHub issue: a body with the conclusion, evidence,
  draft, owner decisions and what is unverified, then one comment per later round (an
  "Addendum N" each, corrections included). This keeps them out of terminal scrollback.
- A fact a future session needs goes in the file that governs it, in the PR that makes it
  true (CLAUDE.md § Session Start).
- Paywalled or unfetchable material goes in `.claude/research-inbox/` as claim, quote and
  citation, never the article.

## 6. Time boxes

When the owner gives a time budget ("research for 10 more minutes"), run
`date -u +%H:%M:%S` as the first action and say "started at <time>". Check the clock between
rounds, and report the elapsed time from that first reading. Without a recorded start, the
elapsed time cannot be shown (the 2026-11-22 goal check could not confirm it).

## 7. Mechanics

- Run independent fetches in parallel: `web-fetch` agents in the background for long pages,
  your own Bash for PDFs and repo checks.
- Ask a fetch agent for verbatim quotes, marked paraphrase, the exact model names and the
  date. It reads pages; you verify numbers.
- Keep downloads in their own scratchpad directory, and pass their paths as arguments.
