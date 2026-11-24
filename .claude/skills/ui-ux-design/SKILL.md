---
name: ui-ux-design
description: General UI/UX design judgement for the web app: how to plan, critique and propose a design change, and the working rules for hierarchy, layout and spacing, typography, colour, components and states, feedback, mobile, interface writing, data display and accessibility. Use when designing, changing or reviewing any screen or mockup (apps/miniapp, docs/handoffs/design-mockups), when asked how something should look or work, or before proposing variants under #644.
paths: apps/miniapp/**, docs/handoffs/design-mockups/**, packages/design/**
---

# UI/UX design

Researched 2026-11-23 from primary sources (§ Sources). Quotes are as the page gives them;
what was read only in part is under § Not verified.
This is the general craft. It does not replace the repo's own documents, which win where they
speak:

| Question | Where it is settled |
| --- | --- |
| What a reading may say, copy honesty | `.claude/rules/readings.md`, `design-system-v1.md` § Copy rules |
| What each screen holds now | `docs/handoffs/miniapp-design-v1.md`, then the component's header comment |
| Tokens and how the client reaches them | `packages/design`, `miniapp-patterns` skill |
| Motion: whether, how long, which easing | `motion` skill |
| Placement, touch accuracy, browser features | `.claude/docs/ui-craft.md` |
| Line-by-line interface rules (focus, forms, safe areas) | `web-design-guidelines` skill |
| Charts | `dataviz` skill |
| Why the current look reads as AI-made | #637, #644; findings on contrast and uncertainty in #648 |

**Design is a conversation** (owner, 2026-10-01). Everything here is a reason to propose
something, never a reason to change a screen silently. A proposal is variants in a standalone
HTML mockup (`docs/handoffs/design-mockups/<name>.html`, phone frame at 390 px, notes column),
published as a private Artifact for the owner's phone. Two things are not taste and are not
up for a vote: the copy rules and the contrast floors.

## 1. Process

1. **Start from the job, not the screen.** Name the person (the owner, or a partner who did
   not build it), the moment (in bed the night before, in the car at the crag, planning a trip
   weeks out) and the one decision the screen serves ("is it climbable now", "which day",
   "which crag"). A screen that serves two decisions equally serves neither.
2. **Find the one thing.** What must be read in the first second? Everything else is
   subordinate to it, and is placed, sized and coloured so.
3. **Plan in tokens before code** (Anthropic `frontend-design`): the palette as named values,
   the type roles, the layout as a one-line description or an ASCII wireframe. Then ask
   whether this plan would come out of any similar brief. If yes, it is a default, not a
   choice: change it.
4. **Make two or three variants that differ on the axis in question**, not three shades of
   one idea. Screenshot them side by side at 480×1000.
5. **Critique against § 12** before showing anyone. Take one thing away ("look in the mirror
   and remove one accessory").
6. **After the owner picks, build to the mockup**, then compare the built screen to the
   mockup in `check:ui` screenshots. One phase here was once built twice from a prose
   description; open the mockup, not a summary.

## 2. Hierarchy

- **Order by importance, top to bottom** (Apple HIG Layout: "Order content by relative
  importance."). The answer to the screen's question comes first; method and provenance last.
- **Hierarchy is made with colour and contrast, scale, and grouping** (NN/g, Gordon 2021),
  and with as few of them as will do. NN/g's limits: "Use no more than 3 sizes" in a
  composition, no more than two big elements, "no more than 3 contrast variations", and
  "Do not rely only on color to communicate visual hierarchy." Changing three properties to
  mark one level is how a screen gets loud.
- **Squint test** (NN/g, paraphrased): blur the screenshot. The groups and the one thing should still
  show. If they do not, hierarchy is carried by detail the eye cannot see at a glance.
- **Spend boldness in one place** (Anthropic `frontend-design`). One element is the memorable
  thing; the rest is quiet and disciplined.
- **Structure is information.** A border, rule, numbered marker, eyebrow or label must tell
  the reader something about the content. Numbers only for real sequences. A caps label
  above a heading that repeats the heading is noise (#637: `TODAY`, `NEXT DAYS`).
- **Say it once.** The same reading in two places on one screen (the Drying ring and the
  row beside it, #648) halves the attention each gets and asks the reader to check they
  agree.

## 3. Layout and spacing

- **Group by space first, containers second.** "Items close together are likely to be
  perceived as part of the same group" (NN/g, Harley 2020, proximity). A boundary is
  stronger and "can overpower other grouping principles" (NN/g, common region). Before
  adding a border or card, ask NN/g's question: "Can I communicate this grouping by simply
  adding or removing whitespace?" Use a container when whitespace cannot do it, when the
  group mixes element types, or when it is one tappable thing. "Borders are often added in
  an abundance of caution."
- **Do not crowd unrelated things together.** "Grouping together unrelated elements may
  camouflage them." A button next to an unrelated reading reads as belonging to it.
- **Full-width bordered bands can make a false floor**, so the reader thinks the page ended
  (NN/g, common region).
- **Cards** are "a container for a few short, related pieces of information"; they "work
  best for collections of heterogeneous items" and for browsing. They are "a poor choice when
  users need to compare between multiple options"; for same-type items, "consider using a
  standard vertical list" (NN/g, Laubheimer 2016). So: seven days to compare are a list or a
  table, not seven cards. Identical rounded cards stacked down a page are the "SaaS-card kit"
  default (Anthropic `frontend-design`, trait 4; #637). A tile in a card in a card is one
  level too many.
- **Spacing from a scale, never by eye.** The repo's values are `spacing` in
  `packages/design`. Use fewer, larger steps between groups than within them: the gap
  between groups should be visibly larger than the gap inside one, or proximity stops
  working.
- **Alignment:** one left edge for text in a column. Numbers that compare line up on the
  right (or on the decimal) with tabular figures.
- **Phone width is the design width.** The owner reads at about 480 px; mockups draw at 390.
  Nothing scrolls sideways (`check:ui` fails on it). Content goes in the middle, controls at
  the edges with larger targets (`ui-craft.md` § 1).

## 4. Typography

- **Size.** Apple's iOS default text is 17 pt and its minimum 11 pt (HIG Typography). At the
  default Dynamic Type setting: Large Title 34, Title 1 28, Title 2 22, Title 3 20,
  Headline 17 semibold, Body 17, Callout 16, Subhead 15, Footnote 13, Caption 1 12,
  Caption 2 11 (leading 41/34/28/25/22/22/21/20/18/16/13). Material 3's smallest role is
  `label-small` at 11 px / 16 px line; its body roles are 12, 14 and 16 px. Body text on the
  web: 15–25 px (Butterick). So 11 px is the platforms' floor for short labels, and running text sits at 15–17. The app's
  own floor is 12 px (owner, #644, 2026-11-23): every `typeV2` role is 12 or more, and chart
  labels are `LABEL_SIZE` in viewBox units, 12 px or more at the app's widths. Apple: "In general, avoid light font weights." The app had
  ten styles at 9–10 px (#648); all were raised to 12 on 2026-11-24 (#653). A new style
  below 12 px needs the owner.
- **Line height.** 120–145% of the size (Butterick); Material's body roles sit at 133–150%.
  Text must survive a user override to 1.5× line height, 0.12em letter spacing and 0.16em
  word spacing without clipping (WCAG 1.4.12, AA). Fixed-height boxes around text break
  this.
- **Line length.** 45–90 characters including spaces (Butterick); Anthropic's skill says
  under 80. On a 390–480 px phone this is rarely too long, but footnotes in small type can
  run past it.
- **A scale, not a pile of sizes.** Material 3 uses 15 roles (display, headline, title,
  body, label × large, medium, small); the app as a whole needs perhaps five or six, and any
  one group no more than three sizes (§ 2). The app has 25+ sizes (#637). Pick roles, name them by job, and map each text to a role.
- **One or two families.** If two, make them clearly distinct (Anthropic `frontend-design`).
  Choose them for a reason drawn from the subject, not by habit. Butterick: avoid
  monospaced faces for text; for figures that change or line up, use tabular figures in the
  text face instead (`font-variant-numeric: tabular-nums`).
- **Capitals.** "All caps are fine for less than one line of text", with 5–12% extra letter
  spacing (0.05–0.12em) (Butterick). Lowercase is never letterspaced. A tracked caps eyebrow
  on every heading is a template tell (#637); use sentence case for headings. The app has no
  tracked caps since #652 and #653 (owner's #644 pick): `typeV2` sets no `textTransform`.
- **Weight and style.** "Use bold or italic as little as possible, and not together"
  (Butterick). Do not emphasise one word in a heading with a different colour or style
  (Anthropic `frontend-design`).

## 5. Colour

- **Few colours, each with one job.** NN/g (Gordon, 2021): "Limit your palette to three
  colors", roughly 60% dominant, 30% secondary, 10% accent, and "Reserve the accent color for
  what you want to stand out the most." Data hues are a separate, named set (charts), not
  part of the interface palette.
- **One meaning per colour, everywhere.** Apple: "Avoid using the same color to mean
  different things." NN/g: "If you use red as a warning color on one screen, it should be not
  used to mean something different elsewhere." Name colour tokens by purpose, not appearance
  (Apple: each dynamic colour "is semantically defined by its purpose"). Here the score
  colours (`good`/`fair`/`poor`) mean conditions and nothing else; an action must not wear a
  score colour (#637 found lime used for both).
- **Never colour alone** (WCAG 1.4.1, Level A): pair it with a word, shape or position. A
  lightness difference of 3:1 or more also counts.
- **Build a surface ladder with a job per step.** Radix's 12-step scale is a good model:
  1 app background, 2 subtle background, 3 element background, 4 hover, 5 pressed or
  selected, 6 subtle non-interactive border, 7 interactive border, 8 strong border and focus
  ring, 9 solid fill, 10 hovered solid, 11 low-contrast text, 12 high-contrast text. If two
  tokens do the same job, merge them; if a job has no token, the next screen will invent one.
- **State as a layer.** Material 3 expresses interaction states as an overlay of the content
  colour at fixed opacities: hover 8%, focus 12%, pressed 12%, dragged 16%. A consistent rule
  beats a hand-picked colour per button.
- **Measure contrast on the composited colour.** An opacity token gives a different ratio on
  every surface; compute the rendered colour over the real background (#648 found `txt5` at
  2.76–3.70:1). Floors: § 11.
- **Dark and light.** In dim light, dark text on a light ground reads faster. In daylight,
  polarity made no significant difference (Dobres et al. 2017). NN/g advises against dark
  mode by default for a general audience. Apple: "Ensure that your app looks good in both
  appearance modes", "Avoid offering an app-specific appearance setting" (follow the
  system's), and "In rare cases, consider using only a dark appearance." Reconciled: if a
  light theme comes, it follows `prefers-color-scheme` rather than an in-app switch. The app
  is dark-only today (`miniapp-design-v1.md` § 1); changing that is the owner's call (#648).
  Sunlight is handled by size and contrast, not polarity. In dark mode Apple asks for 4.5:1
  at least and to "strive for a contrast ratio of 7:1, especially in small text."

## 6. Components and states

Every view that loads data has five states. Design all five, in the mockup, before building:

| State | What it must do |
| --- | --- |
| Loading | Keep the layout stable. Under 1 s, show nothing. A full-screen load under 10 s: a skeleton shaped like the content, never a bare frame. One module taking 2–10 s: a spinner in it. Over 10 s: a progress bar (NN/g, Tankala 2023) |
| Empty | Say why it is empty and offer the next action. "An empty screen is an invitation to act" |
| Partial | Show what arrived; mark what did not as a gap, never as a plausible value (architecture.md: withhold, never inflate; defect class 1) |
| Error | Say what went wrong and how to fix it, in the interface's voice, without apology; offer a retry. Never the same output as a real empty result (defect class 2) |
| Ideal | The designed screen |

- **Buttons.** A button says exactly what it does ("Save crag", not "Submit"), and the
  result keeps the same word ("Saved") (Anthropic `frontend-design`). Apple: "Keep the
  number of prominent buttons to one or two per view"; "Use style — not size — to visually
  distinguish the preferred choice"; "Don't assign the primary role to a button that
  performs a destructive action."
- **Disclosure.** "Show users only a few of the most important options" first, and make
  it "obvious how users progress" (NN/g, Nielsen 2006). More than two levels of disclosure
  "typically have low usability"; offer one path to the secondary content, not several.
  Explanations of method (ensemble medians, model names) belong
  behind `Sources`, led by a plain sentence (#648).
- **Destructive actions** confirm or offer undo (`ui-craft.md` § 1; `Remove location`
  already asks twice).

## 7. Interaction and feedback

**Nielsen's ten heuristics** (NN/g, 1994, reviewed 2024) are the standard review lens. Each
one, with what it means here:

1. **Visibility of system status:** "keep users informed about what is going on". Here:
   how fresh a forecast is, and that a refresh happened.
2. **Match the real world:** "speak the users' language". Climbers' words, not model names.
3. **User control and freedom:** a "clearly marked 'emergency exit'". Back always works
   (`backTarget.ts`), and edits can be cancelled.
4. **Consistency and standards:** one word and one colour per meaning, and platform
   conventions over invention.
5. **Error prevention:** stop the problem before it happens, for example by confirming a
   removal.
6. **Recognition rather than recall:** keep options visible. Do not make people remember a
   number from another tab to read this one.
7. **Flexibility and efficiency:** shortcuts for the frequent user (`Rearrange cards`) that
   a newcomer does not need.
8. **Aesthetic and minimalist design:** "Interfaces should not contain information that is
   irrelevant or rarely needed."
9. **Recognise, diagnose, recover from errors:** "plain language (no error codes)", plus
   what to do next.
10. **Help and documentation:** "It's best if the system doesn't need any additional
    explanation"; when it does (How the score works), make it findable.

**Response times** (Nielsen 1993): 0.1 s feels instantaneous; past 1 s, show that work is
happening; past 10 s, show progress and a way to stop. Feedback for an action (a press state,
the change shown where the person is looking) belongs in the first 0.1 s; motion timings are
the `motion` skill's.

- **Targets.** WCAG 2.5.8 (AA): at least 24×24 CSS px, or spaced so a 24 px circle on each
  does not overlap another; 44×44 is the AAA level (2.5.5). Apple: "a button needs a hit
  region of at least 44x44 pt"; iOS controls are 44×44 by default with a minimum of 28×28.
  Size by position: about 42–46 px at the screen edges, smaller in the middle (Hoober,
  `ui-craft.md` § 1). Aim for 44 px; never under 24.
- **No haptics on iOS web** (`ui-craft.md` § 3). Do not design anything that depends on them.

## 8. Mobile

- **Bottom navigation for top-level sections, at the edge, with large targets.** A crag
  replaces it with the dock (`miniapp-design-v1.md` § 2).
- **Respect safe areas**: `env(safe-area-inset-*)` with a `0px` fallback, `100dvh`.
- **One column.** A second column on a phone is a table, and must work as one.
- **Glance first.** The common use is a few seconds at a time. The first screen of a view
  answers its one question without scrolling; detail follows below.
- **Glass belongs to the navigation layer, not content.** Apple HIG Materials: "Don't use
  Liquid Glass in the content layer"; it "forms a distinct functional layer for controls and
  navigation elements"; "Use Liquid Glass effects sparingly"; for content, "use standard
  materials". The app puts glass on every content card (#637, #644).

## 9. Writing in the interface

- **Write from the person's side.** Name things by what they mean to a climber, not by how
  the system computes them (Anthropic `frontend-design`).
- **Active voice, sentence case, plain verbs, no filler.** Each piece of text does one job.
- **Honesty first.** A reading is a label and a value, never a sentence, with no climbing
  opinion and no "p10/p90" jargon (`readings.md`, `design-system-v1.md` § Copy rules). These
  rules beat any style advice here.
- **Errors explain and direct; empties invite.** Never vague, never apologetic.

## 10. Data display (weather)

- **Charts follow the `dataviz` skill.** This section covers only what that skill cannot
  know. Apple's chart rules in one breath: "Not every collection of data needs to be
  displayed in a chart"; "Keep a chart simple, letting people choose when they want
  additional details"; "prefer using common chart types"; "Prefer consistency across
  multiple charts"; "Aid comprehension by adding descriptive text to the chart."
- **Show uncertainty with the number, not in a footnote.** In lab studies, adding a
  probability to a single-value forecast improved decisions and trust (LeClerc & Joslyn 2015).
  A probability of crossing the decision threshold helped most (Burgeno & Joslyn, WCAS).
  Both studies used student samples (#648). A plain-words probability is allowed by the copy
  rules; p10/p90 labels are not.
- **A scale that saturates cannot rank.** A row of identical maxima (six `100`s) gives no
  reason to choose. That is a design problem even when the number is right.
- **Show revisions as revisions.** A forecast that changed ("was 70, now 85") raised trust
  in Burgeno & Joslyn when shown with its probability. Hiding the change does not hide the
  uncertainty.
- **The semantic colours are not data colours** (`miniapp-design-v1.md` § 1).

## 11. Accessibility floor (not taste)

- **Text contrast** 4.5:1; large text (24 px, or 18.5 px bold) 3:1. "4.499:1 would not
  meet" (WCAG 1.4.3). Measure over the rendered background.
- **Non-text contrast** 3:1 for a control's edges and states, and for chart lines needed to
  read the chart, unless a text label carries the same information (WCAG 1.4.11).
- **WCAG 2's formula, not APCA.** WCAG 3 has no contrast algorithm yet (Editor's Draft,
  2026-04-08, via Roselli). Radix states its guarantees in APCA; check those steps with WCAG
  2 before adopting them.
- **Targets** 24 px minimum (§ 7). **Colour** never alone (§ 5). **Text spacing**
  overrides survive (§ 4). **Reduced motion** keeps opacity and colour changes, drops
  movement (`motion` skill).

## 12. Critique checklist

Run it on a mockup before showing it, and on the built screen's `check:ui` screenshot.

- What is the one decision this screen serves, and can it be made in the first second?
- What is the one thing? Is it the most visually prominent element, and is anything
  competing with it?
- How many levels of hierarchy are there? More than three is too many.
- Does every border, card, label, divider and icon carry information? Remove one.
- Is anything said twice on this screen?
- Does every colour mean one thing, and is any score colour used for something other than a
  score?
- Is every text style a named role, at 12 px or more, at 4.5:1 or better on its real
  background?
- Are the loading, empty, partial and error states designed, and is a missing input a gap
  rather than a number?
- Would this layout come out of any similar brief? If so, what in it was chosen for
  climbing?
- What does a partner who did not build this read first, and do they understand it without
  the method?

## Not verified

- Apple's Typography, Layout, Colour, Accessibility, Buttons and Materials pages were read
  only in part (their JSON is long). The default Dynamic Type sizes, the 44/28 pt controls
  and the dark-mode quotes were checked against the JSON directly.
- Material 3's numbers come from the `material-web` repository's token files
  (`tokens/versions/v0_192`), because the m3.material.io pages render empty to a fetch.
  That repository says it is "in maintenance mode pending new maintainers"; the values may
  lag the live spec. Material 3's spacing grid and window size classes were not read.
- Butterick's pages show no date.

## Sources

- NN/g: Nielsen, 10 usability heuristics https://www.nngroup.com/articles/ten-usability-heuristics/; Gordon, visual hierarchy https://www.nngroup.com/articles/visual-hierarchy-ux-definition/; Harley, proximity https://www.nngroup.com/articles/gestalt-proximity/ and common region https://www.nngroup.com/articles/common-region/; Nielsen, response times https://www.nngroup.com/articles/response-times-3-important-limits/; Nielsen, progressive disclosure https://www.nngroup.com/articles/progressive-disclosure/; Tankala, skeleton screens https://www.nngroup.com/articles/skeleton-screens/; Laubheimer, cards https://www.nngroup.com/articles/cards-component/
- Apple HIG (read as JSON from https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json): typography, layout, color, accessibility, dark-mode, charting-data, buttons, materials
- Anthropic, `frontend-design` skill: https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md
- Butterick, Practical Typography: https://practicaltypography.com/summary-of-key-rules.html, https://practicaltypography.com/line-length.html, https://practicaltypography.com/letterspacing.html
- W3C WCAG 2.2 Understanding: 1.4.1 https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html, 1.4.3 https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html, 1.4.11 https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html, 1.4.12 https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html, 2.5.8 https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Roselli, WCAG3 contrast as of April 2026: https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html
- Radix Colors, understanding the scale: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- NN/g, Gordon (2021-06-06), colour: https://www.nngroup.com/articles/color-enhance-design/
- NN/g, Budiu (2020-02-02), dark mode: https://www.nngroup.com/articles/dark-mode/
- Dobres, Chahine & Reimer (2017), Applied Ergonomics 60: https://pubmed.ncbi.nlm.nih.gov/28166901/
- Material 3 tokens (material-web): https://github.com/material-components/material-web/tree/main/tokens/versions/v0_192
- LeClerc & Joslyn (2015), Risk Analysis, DOI 10.1111/risa.12336; Burgeno & Joslyn, Weather, Climate, and Society, DOI 10.1175/WCAS-D-22-0064.1 (read for #648)
