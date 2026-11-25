# Whole-app mockup in the #644 crag design (v1, paused 2026-11-25)

**Status: work in progress, paused by the owner mid-review.** Nothing here is approved or
built. The look of record for the running app is still `look-variants-644.html` variant C
(`design-system-v1.md`); this mockup is the candidate that would replace it.

## What it is

`design-mockups/whole-app.html` is every screen of the real app (the same screens, sections,
order, copy and controls, with figures from Wed Nov 25 as account `tim`), rebuilt in the crag
design worked out in this session: `design-mockups/passo-feel-644.html`, "v26". That design is
lit glow behind each page, figures standing on a white rule, numbers that roll in, lit bars
that grow, the water gauge, rain tubes and a glass dock, plus the look sliders above the phone
("Ground, Glow, Card edge, Lightness, Grain, Cards") that restyle every screen at once.

- **The owner views it** through a private Artifact,
  https://claude.ai/artifact/Nr1pjy6kdYZbP2qU6bu7oq (version 7 at the pause). Corrections came
  as comments on that page; keep publishing to the same URL so the threads stay attached.
- **Iterated in chat, not as PRs** (owner, 2026-11-25): no PR per mockup revision.
- **Crag pages:** the six real tabs (Overview, Daily, Hourly, Precip, Rock, Crag) in the dock.
  They keep v26's sample day (Red Wing drying after rain, 52 at 9 AM), because on Nov 25 every
  crag scored 100 and the design showed nothing; every crag opens Red Wing. The Overview's
  breakdown rows and "41 h since real rain" are invented to fit that sample day.
- **Minneapolis** keeps the app's four city tabs. Map tiles are a drawing.

## The owner's corrections and what was done (2026-11-25)

| Comment | Done in |
| --- | --- |
| "Rebuild all the screens in the new design" (v3 had only restyled colours) | v4: v26 is the base document; every screen uses its parts |
| Dock bar too large; narrower and longer | v5: 40 px tabs, nearly full width |
| Remove Further out | v5: hidden on Daily (`.fo{display:none}`; its script still runs) |
| Footer (Sources, Check this forecast, Remove location) too large on all pages | v5: 14 px, tighter rows |
| Hourly "Chance · amount" wording jumbled | v5: each header sits over its column (Amount · Chance) |
| "What does the 60 minutes mean?" (minutes of bright sun in the hour) | v5: All view draws it as a sun meter; detail says "Sun this hour" |
| Hourly charts tight, hard to see where one ends | v5 taller (owner: "You didn't do anything?"), v7: each chart on its own panel |
| Overview lacklustre; should be "can I climb here now/today" | v5: the real Overview's four sections (hero with Dryness, Rock, Air, Good hours, caveat, Score breakdown; Today; Next days; Right now) |
| Numbers clipped; font should be the real app's | v5: Barlow Condensed (figures, headings, labels, buttons) and Barlow (sentences) replace Space Grotesk; v6 (owner: "Needs more work"): rolling-number box larger than the glyphs, hero 700 weight |
| Conditions page feels like a different app | v5: crag rows in v26 parts; v7 (owner: "Scores are way too large"): score 32 px beside the name |
| Trip "How the forecast has moved" doesn't match | v5: lit rain capsules against the first forecast's outline; whole-trip figures and range tracks |

**Awaiting the owner's look** at v6/v7: the clipping on a phone (Safari was not available to
test; Chromium shows none), the Conditions score size, and the chart panels. The font reading
("the font on everything is the font we use in the real app. Fix that") was taken to mean
"use the app's fonts"; the owner has not confirmed it.

## Open questions in the mockup's notes

- Six tabs in the dock: icons plus the chosen tab's name, or text-only with Overview shortened.
- Accent: white actions, or bring aqua back as the one action colour.

## A defect found in v26

v26 lost a `/*` opener before the comment "Hours: the other pages. A lit strip …", which
swallowed the next rule and broke the Hourly day picker ("TodayThuFri…"). The whole-app build
restores it; `passo-feel-644.html` itself is kept as approved, unfixed.

## Rebuilding

The page is generated; edit the sources, not `whole-app.html`.

```bash
cd docs/handoffs/design-mockups/whole-app-src
node build.cjs                      # writes ../whole-app.html
CHROME=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node shoot.cjs "$PWD/../whole-app.html"
```

- `build.cjs` patches `../passo-feel-644.html` (six tabs, the Crag page, search list, the app
  layer, notes) and injects `app.js` + `app.css`, pieces of the earlier mockup's
  `app2-app.js`, and `data.json` (the real Nov 25 responses).
- `v5.cjs` applies the owner's comments on top (fonts, dock, footer, Overview, Hourly).
- `app.js` holds every non-crag screen, the router and `window.WT.JUMPS` (the jump list).
- `shoot.cjs` visits every jump in Chromium and reports page errors and sideways overflow
  (decorative `light` elements are clipped and expected); `long.cjs` screenshots one screen at
  several scroll offsets. `CHROME` is needed where the repo's Playwright differs from the
  pre-installed browser.
- The invite link in Profile is a placeholder (`join#EXAMPLE-invite-token`); never paste a
  real one.

## When it is approved

Build it against the docs, not this note: `miniapp-design-v1.md`, `design-system-v1.md` and
the copy rules in `.claude/rules/readings.md` still govern, and the change to fonts, dock and
Overview layout needs the owner's explicit pick recorded in `design-system-v1.md`.
