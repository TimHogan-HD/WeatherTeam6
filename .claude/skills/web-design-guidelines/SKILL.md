---
name: web-design-guidelines
description: Review web-app UI code against Vercel's Web Interface Guidelines — accessibility, focus, forms, animation, typography, touch, safe areas, theming. Use when asked to review a screen's UI or UX, check accessibility, or audit the web app against best practices.
---

# Web Interface Guidelines review

The rules are `RULES.md` beside this file: Vercel's `command.md` from
github.com/vercel-labs/web-interface-guidelines @ `e3d624b` (MIT, see `LICENSE`). It is a
frozen copy rather than a live fetch, so the rules cannot change under a review. To update
it, fetch the file at a newer commit, read the diff, and replace both `RULES.md` and the
commit above.

## How to review

1. Read `RULES.md`.
2. Read the files you were given; if none, ask which.
3. Apply every rule, then drop the findings the section below overrides.
4. Report in `RULES.md`'s output format: grouped by file, terse `file:line` findings.

## In this repo — these override the rules

Where `RULES.md` and the repo disagree, the repo wins: `docs/handoffs/miniapp-design-v1.md`
(binding), `docs/handoffs/design-system-v1.md` and `.claude/docs/ui-craft.md`.

- **Sentence case, not Title Case**, for headings and buttons ("Check this forecast").
- **No hover state is required.** The app runs on a phone; any hover style goes behind
  `@media (hover: hover) and (pointer: fine)`.
- **A destructive action confirms with a second tap** (`Tap again to remove`,
  `LocationDetail.tsx`). That satisfies the confirmation rule; do not ask for a modal.
- **A pressed control dims at once, with no transition** (owner decision 2026-09-30).
- **Styling is mostly inline React styles with tokens**, not Tailwind. Translate a rule that
  names a Tailwind class (`focus-visible:ring-*`, `truncate`, `min-w-0`) into its CSS
  meaning.
- **Hydration rules do not apply.** The app is a client-rendered Vite build with no server
  rendering.
