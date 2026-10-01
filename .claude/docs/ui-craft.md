# UI craft: placement, feel, and the tools for it

Research of 2026-10-01, written for the session that next changes a screen. Read it with
`docs/handoffs/miniapp-design-v1.md` (binding) and `design-system-v1.md` § CSS and motion.
Neither of those is overridden here. This file collects the numbers and tools they leave
out, and checks each one against what the app looks like in `check:ui`'s screenshots.

## 1. Placement

**The well-known "thumb zone" heatmap was retracted by its author.** Steven Hoober observed
over 1,300 people in 2013 (49% one-handed, 36% cradled, 15% two-handed) and drew the green/yellow
/red reach diagram. He later said the diagram was "a bit of a lie". When he measured
millions of real touches, people touched the **centre** of the screen most often, fastest
and most accurately, and the top and bottom edges least accurately. So:

- **Size a target by where it sits:** about 42 px at the top edge, 46 px at the bottom edge,
  and as little as 27 px in the middle (Hoober's figures, via Smashing). WCAG's 24 px is the
  floor, not the goal.
- **Primary content goes in the middle and controls go at the edges, with bigger targets
  there.** The bottom bar is right for navigation because it sits at the edge with large
  targets, not because it is easy for a thumb to reach.
- **Rare actions can sit in the hard places.** `Feedback` at top right is fine. The six-tab
  row at the top of a location is used constantly and sits at the least accurate edge, so
  its targets should stay generous.
- **A destructive action confirms the removal or offers an undo** (Vercel guidelines).
  `Remove location` already does: it sits beside `Check this forecast` and `Edit crag`, and
  asks for a second tap (`Tap again to remove`, `LocationDetail.tsx`).

## 2. Feel

Most of this comes from Emil Kowalski's skills and Vercel's Web Interface Guidelines, and
both agree on it.

| What moves | Duration | Easing |
| --- | --- | --- |
| Press feedback | 100–160 ms | ease-out |
| Popover, tooltip | 125–200 ms | ease-out from the trigger |
| Dropdown, disclosure | 150–250 ms | `cubic-bezier(0.23, 1, 0.32, 1)` |
| Sheet, drawer | 200–500 ms | `cubic-bezier(0.32, 0.72, 0, 1)` (iOS drawer) |
| Moving on screen | under 300 ms | `cubic-bezier(0.77, 0, 0.175, 1)` |

- **The more often something happens, the less it should move.** Something used 100+ times
  a day gets no animation. Something used occasionally gets a short one. Something rare can
  have some delight. The instant press dim is already correct by this rule.
- **Never `ease-in` on UI**, never `transition: all`, never `scale(0)` (start at 0.95 with
  opacity 0). Animate only `transform` and `opacity`.
- **Use transitions, not keyframes, for anything a person can interrupt.** A transition
  retargets mid-flight; a keyframe restarts from zero.
- **Exits should be faster than entrances.** The system responding should be quicker than
  the person deciding.
- **Stagger a group by 30–80 ms** at most, and never block input while it plays.
- **`prefers-reduced-motion` drops movement but keeps opacity and colour changes.** It does
  not mean "no change at all".
- **Gate hover effects behind `@media (hover: hover) and (pointer: fine)`** so a tap on a
  phone does not leave a hover state stuck on.
- **Show a loader only after 150–300 ms, and keep it up for at least 300–500 ms.** A
  skeleton must have the same shape as the content it stands for, or the screen jumps when
  the content arrives.
- **Use tabular figures for numbers that change or line up in columns**
  (`font-variant-numeric: tabular-nums`). The app sets this nowhere, so a figure changes
  width when it updates, and the chart readout jitters as you scrub.

## 3. What the phone's browser can do (checked 2026-10-01)

| Feature | Status | Use here |
| --- | --- | --- |
| View Transitions, same-document | Safari 18+, Chromium | List card → detail, with the crag name carried across |
| View Transitions, cross-document | Safari 18.2+, Chromium | Not needed: the app is a single-page app |
| React `<ViewTransition>`, `addTransitionType` | Stable in **React 19.3** (2026-09-09). The app pins 19.2.3 | Upgrade first, or call `document.startViewTransition` directly |
| `@starting-style` | Safari 17.5+, Chromium | Entrances without a "mounted" state in React |
| Scroll-driven animations | Safari 26+, Chromium; not Firefox | Header shrinking as you scroll. Progressive enhancement only |
| Anchor positioning | Baseline January 2026 | Chart readouts, popovers |
| `popover`, `<dialog>` | Baseline | Sheets and menus, if a screen needs one |
| `interpolate-size` / `height: auto` transitions | Chromium only | Use a `grid-template-rows: 0fr → 1fr` transition for Measurements |
| Web haptics | **None on iOS.** `navigator.vibrate` was never implemented, and iOS 26.5 closed the `<input switch>` workaround | Do not design anything that depends on haptics |

## 4. What makes a screen look AI-generated, checked against this one

Anthropic's `frontend-design` skill and Impeccable list the same defaults: a tracked
ALL-CAPS label above every heading, monospace for small data labels, meta strings joined
with middle dots, one radius and one shadow on a stack of identical cards, bounce easing,
and an arrow appended to every link.

The app has several of these: `WEATHERTEAM6`, `BASALT (DENSE)`, `CONDITIONS NOW · 16:00`
and `THE ROCK HERE` as tracked caps; `1 saved · updated just now` and the coordinates in
monospace; `Hourly ›` and `Daily ›` as links. **Most of them came from the owner's Figma
file**, so raise a change with the owner before making it (see the
`figma-visuals-over-rule-substitutes` memory). Asking "does this label carry information?"
is still fair. `THE ROCK HERE` over the heading `Basalt (dense)` probably does not.

`npx impeccable detect apps/miniapp/src` found one thing: the bottom bar pill's
`cubic-bezier(.3, 1.25, .45, 1)` overshoots, which it calls bounce easing. Changing it is
the owner's call. **The detector is written for CSS and Tailwind**, so it misses most
problems in inline styles. A clean result here says little.

## 5. Candidates on the current screens

These are not decided. Each is a proposal to show as variants (§6).

1. Tabular figures across every number.
2. The location tab underline slides between tabs, like the bottom bar pill.
3. The Measurements disclosure opens with a height transition, and its chevron turns.
4. The selected day chip on Hourly slides its fill to the new day instead of jumping.
5. A shared-element view transition from a list card into the location.

## 6. Tools

**Already here:**

- `npm run check:ui` drives Chromium through Playwright at the owner's 480×1000 viewport and
  screenshots every screen. If port 3096 is taken, another session is running it, and its
  screenshots are under `%TEMP%\wt6-ui-check-*`.
- The Playwright MCP server can click through anything the script does not cover. It can
  also run WebKit, the nearest stand-in for Safari.
- The Figma MCP server is connected. Use it to read the WT6 file as the design source.
- Skills: `dataviz` (charts), `pstack:principle-exhaust-the-design-space` (build two or
  three variants), `pstack:principle-experience-first`.

**Not installed. Worth installing, in this order:**

| Tool | What it adds | How |
| --- | --- | --- |
| `frontend-design` (Anthropic, official marketplace) | The design-direction pass and the list of AI defaults in §4 | `/plugin` → claude-plugins-official |
| Emil Kowalski's `skills` (`emil-design-eng`, `review-animations`) | The motion numbers in §2, plus a review checklist | github.com/emilkowalski/skills |
| Vercel `web-design-guidelines` | 100+ interaction, form and accessibility rules | `npx skills add vercel-labs/agent-skills` |
| Impeccable (Apache-2.0) | `critique`, `polish` and `animate` commands, plus the detector | `/plugin marketplace add pbakaus/impeccable` |
| `playground` (official) | One HTML page with sliders for a visual decision, which writes out the prompt | `/plugin` → claude-plugins-official |

**Process that works with this owner:** mock two or three variants, screenshot them side by
side at 480×1000, let the owner pick, then ship the pick (the
`visual-polish-by-side-by-side-variants` memory). Review each screenshot before reporting
the work done.

## Sources

- Hoober, [How do users really hold mobile devices?](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)
  and [Design for Fingers, Touch and People](https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php);
  [Smashing, accessible target sizes](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/)
- [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines)
- [emilkowalski/skills](https://github.com/emilkowalski/skills); Rauno Freiberg,
  [Invisible details of interaction design](https://rauno.me/craft/interaction-design)
- [Material 3 easing and duration tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)
- [WebKit features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/);
  [React 19.3](https://react.dev/blog/2026/09/09/react-19-3)
- [web-haptics-polyfill notes on iOS 26.5](https://github.com/doublej/web-haptics-polyfill)
- [pbakaus/impeccable](https://github.com/pbakaus/impeccable);
  [funboy322/avoid-ai-design](https://github.com/funboy322/avoid-ai-design)
