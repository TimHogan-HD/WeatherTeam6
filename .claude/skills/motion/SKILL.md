---
name: motion
description: Motion judgement and motion review for the web app — whether something should animate, easing, duration, origin, interruptibility, press feedback, gestures, reduced motion. Use when adding or changing a transition or animation in apps/miniapp, when asked how an interaction should feel, or when asked to review motion code ("/motion review").
paths: apps/miniapp/**
---

<!-- Merged 2026-10-29 from emil-design-eng and review-animations, both vendored from
     github.com/emilkowalski/skills @ d16ebe6 (MIT, see LICENSE). Cut: the philosophy
     prose, Framer Motion, Base UI, tooltips, keyboard surfaces, mouse tracking, 3D
     transforms and the Sonner essay — none of it exists in apps/miniapp. Changed: the
     "In this repo" section, the 300 ms rule (owner tokens exceed it on purpose), and
     the review verdict. -->

# Motion

Two modes. **Building** (default): use the decision framework before writing a
transition. **Reviewing** (asked to review motion, or `/motion review`): apply the
standards and use the output format at the end. Review only motion; send anything else
to `review-checklist`.

## In this repo — read first

**The app's design is open** (owner, 2026-10-01). What is built is the current state, not a
rule to defend. Where this skill would do something different, **say so and show it** as two
or three variants side by side, and let the owner choose. Do not silently apply your
preference, and do not silently drop it either.

**A value the owner chose is not a finding.** Every duration and curve is a `motion` token in
`packages/design/src/tokens.ts`, and many carry an owner date. Several exceed this skill's
300 ms UI budget on purpose: page slide `pageMs` 420, crag swipe `swipeMs` 500, score roll
`rollMs` 700, chart stream `streamMs` 700, dock rise `dockRiseMs` 460 on `spring`, which
overshoots. Raising one with the owner as a variant is fine; blocking a change for matching
one is wrong. A raw `ms` or `cubic-bezier` in a component instead of a token **is** a finding. Components
read the tokens from `motion` in TypeScript (`SelectionIndicator.tsx`); CSS reads the few that
`theme/cssVars.ts` exposes as `--wt6-motion-*`.

What is built:

- **Press:** a pressed control dims at once to `press.opacity` and shrinks to `press.scale`
  over `motion.pressMs` (one `:active` rule in `globals.css`); the dim never waits.
- **Selection:** the bottom bar pill slides leading edge first on `motion.easeOut` with no
  overshoot (`TabBar.tsx`); the location tabs' underline and the Hourly day chips' fill slide
  (`SelectionIndicator.tsx`).
- **Data:** a changed score rolls (`RollingFigure.tsx`); charts stream in behind a bead
  (`charts/StreamIn.tsx`); a crag's cards pour in, opacity and position only, because a card
  is glass over a backdrop blur and squashing it or rounding its corners redraws the blur
  every frame.
- **Gestures:** pull to refresh (`usePullToRefresh.ts`, returns on `drawer`), edge swipe back
  (`useEdgeSwipeBack.ts`), the crag switcher.
- **Reduced motion:** `globals.css` zeroes every transition and animation. That settles at
  once, which is stricter than this skill's "gentler, not zero" — a design disagreement to put
  to the owner, not to apply.
- It is used on a phone (480×1000 CSS px). Hover applies only behind
  `@media (hover: hover) and (pointer: fine)`; there are no keyboard-shortcut surfaces.
- No animation library: CSS transitions, keyframes and WAAPI only. Adding one is a decision
  for the owner.

Not taste, and still in force: the copy rules and contrast floors in
`docs/handoffs/design-system-v1.md`.

## Decision framework (building)

Answer in order before writing a transition.

### 1. Should it animate at all?

| How often it is seen | Decision |
| --- | --- |
| Many times a session (a tab tap, a chip, scrolling a list) | Instant or barely there |
| Several times a session (opening a crag, a disclosure, a sheet) | Standard animation |
| Rare (first run, an invite redeemed, a trip ending) | Room for delight |

Every animation needs a purpose: spatial consistency (where did this come from), state
indication, feedback that a tap landed, or preventing a jarring change. "It looks good" on
something seen often is not a purpose. When unsure, delete it.

### 2. Easing

- Entering or exiting → ease-out: `motion.easeOut`.
- Released by a finger, sheet-like → `motion.drawer`.
- Moving or morphing on screen → a strong ease-in-out (`cubic-bezier(0.77, 0, 0.175, 1)`;
  propose it as a token first).
- Colour change → `ease`. Constant motion (a progress bar) → `linear`.
- **Never ease-in on UI.** It delays the moment the user is watching.
- Built-in CSS easings are too weak for deliberate motion; use the tokens.
- `motion.spring` overshoots; the owner gave it to the dock, the switcher underline and the
  rain columns, never to a control answering a tap.

### 3. Duration

| Element | Duration |
| --- | --- |
| Press feedback | 100–160 ms |
| Small popover | 125–200 ms |
| Disclosure, select | 150–250 ms |
| Sheet, page | 200–500 ms |

Default under 300 ms for UI; anything longer is either an owner token or needs a reason.
Faster feels more responsive, and ease-out at 200 ms feels faster than ease-in at 200 ms.

### 4. Origin and physicality

- Never animate from `scale(0)`. Start at `scale(0.9–0.97)` with `opacity: 0`.
- A popover scales from its trigger (`transform-origin` at the trigger); a centred modal
  stays centred.
- Press feedback is subtle: 0.95–0.98. `scale()` scales children too, which is what a press
  wants.
- `translateY(100%)` moves an element by its own height; prefer percentages to fixed pixels.

### 5. Interruptibility

- Transitions retarget from where they are; keyframes restart from zero. Anything triggered
  rapidly or reversible mid-flight (a toggle, a chip, a drag release) uses a transition.
- `@starting-style` animates entry without JS; fall back to a `data-mounted` attribute set
  after first render.
- For programmatic motion, WAAPI (`element.animate`) gives JS control with CSS performance.

### 6. Asymmetric timing

Slow where the user is deciding, fast where the system responds: a deliberate hold can take
its time, the release snaps (as `disclosureOpenMs` 240 / `disclosureCloseMs` 180 already do).

### 7. Groups

Stagger a group's entrance 30–80 ms per item; longer feels slow. Stagger is decoration —
never block input while it plays. The pour counts only its first `pourSteps` cards.

## Performance

- Animate `transform` and `opacity` only. `width`, `height`, `margin`, `padding`, `top`,
  `left` re-run layout and paint.
- **Glass is expensive here.** Anything over a `backdrop-filter` that scales, rounds or
  blurs during motion redraws the blur every frame; it lagged on the owner's phone
  (2026-10-21). Move glass by opacity and translate only.
- Do not drive a child's transform through a CSS variable on its parent; every descendant
  recalculates. Set `transform` on the element.
- `filter: blur(2px)` can mask a crossfade that shows two overlapping states; keep it small
  and never on glass.
- CSS runs off the main thread and stays smooth while a screen loads; `requestAnimationFrame`
  loops stutter then.

## Gestures

- **Momentum:** dismiss on velocity, not only distance — `|distance| / elapsedMs > ~0.11`.
- **Damping:** past a natural edge, movement shrinks the further the finger goes; friction,
  not a wall.
- **Pointer capture** once a drag starts, so it continues outside the element.
- **One finger:** ignore extra touch points once a drag has begun.
- Test gestures in WebKit (Playwright MCP) or on the phone; Chromium hides Safari's quirks.

## Accessibility

- Every movement honours `prefers-reduced-motion` (here: the global rule in `globals.css`). A
  new animation driven from JS must check it too — the CSS rule does not reach
  `element.animate` timing or a `requestAnimationFrame` loop.
- Hover motion only behind `@media (hover: hover) and (pointer: fine)`.

## Debugging

- Slow it down 2–5× or step it in DevTools' Animations panel: do coordinated properties stay
  in sync, is the origin right, does the curve stop abruptly?
- Look again the next day. Fresh eyes catch what development hides.

## Reviewing motion

Posture: motion that merely runs is not a pass. Sluggish easing, a wrong origin, motion on a
frequent action, or dropped frames are regressions. Default to flagging — except that an
owner-chosen token is never a finding (see "In this repo").

**Flag on sight:**

- `transition: all`
- `scale(0)`, or a pure fade where a small transform belongs
- ease-in on any UI motion
- a raw duration or curve instead of a `motion` token
- UI duration over 300 ms that is neither a token nor justified
- keyframes on something triggered rapidly
- layout properties animated; a parent CSS variable driving child transforms
- anything over glass that scales, rounds or blurs while moving
- JS-driven motion that ignores `prefers-reduced-motion`; ungated `:hover` motion
- symmetric timing on a press-and-hold
- a group appearing all at once where a short stagger belongs

**Prefer fixes in this order:** delete it → reduce it → fix the easing → fix the origin → make
it interruptible → move it to `transform`/`opacity` → asymmetric timing → polish (blur,
stagger, `@starting-style`) → accessibility gating.

### Output

Part 1 — one table, one row per finding, citing `file:line`:

| Before | After | Why |
| --- | --- | --- |
| `transition: 'all 300ms'` | `` transition: `transform ${motion.slideMs}ms ${motion.easeOut}` `` | Name the properties and use the tokens; `all` animates layout off the GPU |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Nothing appears from nothing |

Never a list of "Before:" and "After:" lines.

Part 2 — remaining commentary by tier, highest first, empty tiers omitted: feel-breaking
regressions; motion that should be deleted or reduced; performance; interruptibility and
timing; origin and cohesion; accessibility.

Close with **Block** (a feel-breaking regression, ease-in or `scale(0)` on UI, a non-GPU
animation with an easy fix, motion on glass that redraws the blur) or **Approve**. Any
disagreement with an owner token goes after the verdict as a proposed variant, never as a
reason to block.
