# `apps/miniapp` — WeatherTeam6 Telegram Mini App

Vite + React, static build. This is the project's only client; `apps/mobile` is archived.

The design contract is `docs/handoffs/miniapp-design-v1.md` and it is binding. Read it
before writing a screen — if a decision is not written there, it is not settled.

## What is here (Crossover Task 5 — the shell)

| Path | Purpose |
| --- | --- |
| `src/theme/tokens.css.ts` | Web adapter for `@weatherteam6/design/tokens`. `type`, `shadow` and `layout` are React Native shaped and cannot be used directly (§0a). |
| `src/theme/fonts.ts` | Maps the `expo-font` family names onto CSS families and fallback stacks. `BarlowCondensed` → `"Barlow Condensed"`. |
| `src/theme/cssVars.ts` | Renders the tokens as `:root` custom properties. Served through the `virtual:wt6-tokens.css` module built in `vite.config.ts`, so the block lands in the bundled stylesheet rather than being injected after first paint. |
| `src/theme/globals.css` | Gradient surface, safe-area padding, viewport height. Every `--tg-*` reference carries a fallback (§1). |
| `src/telegram/` | Typed `Telegram.WebApp` surface, chrome bootstrap with per-method version gating, and the `BackButton` hook. |
| `src/routes/` | The three routes (§2). Bodies are placeholders — Task 6 fills them in. |
| `src/lib/queryClient.ts` | React Query defaults fixed by §5. |
| `src/config/env.ts` | `VITE_API_BASE_URL`. Nothing secret may be read here — this bundle is public. |

## Commands

```bash
npm run dev -w @weatherteam6/miniapp        # Vite dev server on :5173
npm run build -w @weatherteam6/miniapp      # tsc --noEmit && vite build → dist/
npm run preview -w @weatherteam6/miniapp    # serve dist/ on :4173
```

`packages/types` and `packages/design` must be built first (`npm run build --workspace=packages/types --workspace=packages/design`). The root `postinstall` does this.

## The token rule

`packages/design` is the only source of colors, spacing and type scale. The adapter
**derives** — it never restates a literal — so a change in the token file carries
through instead of silently diverging. Deriving is not redefining, and that is what
keeps this inside the architecture rule.

Concretely: do not import `type`, `shadow` or `layout` from `@weatherteam6/design/tokens`
in a component. Import them from `src/theme/tokens.css.js`. `colors`, `spacing`,
`radius`, `uvScale` and `units` are plain data and are imported directly.

`components` is deliberately **not** pre-converted: some entries mix text and box
properties, so §0a's "audit per-entry" applies. Use the exported `boxStyle` /
`textStyle` helpers on the entries you need.

## Deploying (not yet done)

The Mini App is its own Vercel project, separate from the API.

1. New Vercel project on this repo, **Root Directory `apps/miniapp`**, with
   *Include source files outside of the Root Directory* enabled — the build imports
   `packages/design` and `packages/types` from the workspace root.
2. Framework preset **Vite**. (Unlike `apps/api`, which must be "Other".)
3. Environment variable `VITE_API_BASE_URL` = the API's production URL. It is inlined
   into the bundle at build time and is public.
4. **Do not set `NODE_ENV`** — same reason as the API: npm would drop devDependencies
   and the root postinstall would lose `tsc`.
5. `vercel.json` here already rewrites every path to `index.html`, which the three
   client-side routes need.

Then register the production URL with @BotFather (`/newapp`, or `/setmenubutton` for
the menu-button entry point). Telegram's origin lockdown means the registered
production domain only — Vercel preview URLs will not open as a Mini App.

## Not built yet

- **`initData` HMAC validation.** The Mini App's credential is
  `Telegram.WebApp.initData`, validated server-side as middleware on `/api/v1/*`. It is
  a hard prerequisite for Task 6, and it ships in the same change that removes Vercel
  SSO protection from the API — SSO off without HMAC leaves the API open on a public
  URL. `API_SHARED_SECRET` must never reach this bundle.
- **The three screens.** Task 6.
- **Deep link.** `startapp` → `/location/:id`, with `/` pushed beneath it so
  `BackButton` reaches the list rather than closing the app. Task 7, spec in §2.
