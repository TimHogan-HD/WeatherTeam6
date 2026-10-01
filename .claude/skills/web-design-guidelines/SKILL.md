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
3. Apply every rule, using the section below for what a finding means here.
4. Report in `RULES.md`'s output format: grouped by file, terse `file:line` findings.

## In this repo — read first

**The app's design is open** (owner, 2026-10-01). Where `RULES.md` disagrees with what is
built, report it as a finding and let the owner decide; do not drop it because the app does
something else today. Context that changes what a finding means:

- Buttons and headings use sentence case ("Check this forecast"). Title Case is a style
  choice to raise, not a defect.
- It is used on a phone, so a missing hover state is not a defect; any hover goes behind
  `@media (hover: hover) and (pointer: fine)`.
- `Remove location` already confirms with a second tap (`Tap again to remove`,
  `LocationDetail.tsx`).
- Styling is mostly inline React styles with tokens, not Tailwind. Translate a rule that names
  a Tailwind class (`focus-visible:ring-*`, `truncate`, `min-w-0`) into its CSS meaning.
- The app is a client-rendered Vite build, so the hydration rules do not apply.

Not taste, and still in force: the copy rules and contrast floors in
`docs/handoffs/design-system-v1.md`.
