# `apps/miniapp` — WeatherTeam6 Telegram Mini App

Vite + React, static build. This is the project's only client; `apps/mobile` is archived.

The design contract is `docs/handoffs/miniapp-design-v1.md` and it is binding. Read it
before writing a screen — if a decision is not written there, it is not settled.

## What is here (Tasks 5 and 6 — the shell and all three screens)

| Path | Purpose |
| --- | --- |
| `src/theme/tokens.css.ts` | Web adapter for `@weatherteam6/design/tokens`. `type`, `shadow` and `layout` are React Native shaped and cannot be used directly (§0a). |
| `src/theme/styles.ts` | The per-entry `components` audit §0a asks for, plus the alert tint derived from `colors.poor` (the palette has `goodTint` and `fairTint` but no `poorTint`). |
| `src/theme/fonts.ts` | Maps the `expo-font` family names onto CSS families and fallback stacks. `BarlowCondensed` → `"Barlow Condensed"`. |
| `src/theme/cssVars.ts` | Renders the tokens as `:root` custom properties. Served through the `virtual:wt6-tokens.css` module built in `vite.config.ts`, so the block lands in the bundled stylesheet rather than being injected after first paint. |
| `src/theme/globals.css` | Gradient surface, safe-area padding, viewport height. Every `--tg-*` reference carries a fallback (§1). |
| `src/telegram/` | Typed `Telegram.WebApp` surface, chrome bootstrap with per-method version gating, and the `BackButton` hook. |
| `src/routes/` | The three routes (§2): `LocationList`, `LocationDetail`, `AddLocation`. |
| `src/components/` | `DetailView` is shared by saved detail and the add flow's preview — the preview is that screen in unsaved mode, which is why `/add` is the only new screen §12 needed. |
| `src/hooks/` | Every API call. Components never call `fetch`. |
| `src/lib/api.ts` | The only place that calls `fetch`. Attaches `Authorization: tma <initData>`. |
| `src/lib/forecast.ts` | Today's row, date labels, and the source attribution — the logic that renders a wrong *value* rather than an error, so it is the part under test. |
| `src/lib/queryClient.ts` | React Query defaults fixed by §5. |
| `src/config/env.ts` | `VITE_API_BASE_URL`. Nothing secret may be read here — this bundle is public. |

`VITE_API_BASE_URL` is the API **origin**; `src/lib/api.ts` appends `/api/v1`. A value
that already ends in `/api/v1` is accepted rather than doubled, because the docs
describing this variable are not unanimous and the failure mode is a 404 inside
Telegram, where there is no preview deployment to debug against.

## Auth

The Mini App sends `Telegram.WebApp.initData` as `Authorization: tma <initData>`. The
API validates it by HMAC against `TELEGRAM_BOT_TOKEN` and checks the signed `user.id`
against `TELEGRAM_CHAT_ID`; the token never reaches this bundle. **Outside Telegram
there is no initData and every call returns 401** — that is expected, and the screens
render their error states rather than crashing.

## Commands

```bash
npm run dev -w @weatherteam6/miniapp        # Vite dev server on :5173
npm run build -w @weatherteam6/miniapp      # tsc --noEmit && vite build → dist/
npm run preview -w @weatherteam6/miniapp    # serve dist/ on :4173
npm run test -w @weatherteam6/miniapp       # vitest, node environment
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

## Deployment

**Live at https://weatherteam6.vercel.app**, opened from the bot's menu button.
Confirmed inside Telegram on 2026-08-25.

The Mini App is its own Vercel project, separate from the API. The settings it was
created with, since they are easy to get wrong if it is ever recreated:

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

The production URL is registered with @BotFather via `/setmenubutton`. Telegram's origin
lockdown means the registered production domain only — Vercel preview URLs will not open
as a Mini App, so there is no preview-deploy path for testing inside Telegram.

**`/newapp` has not been run.** The menu button carries no `startapp` parameter, so
Task 7's deep link into location detail needs a named Mini App registered separately.

## Not built yet

- **`initData` HMAC validation.** The Mini App's credential is
  `Telegram.WebApp.initData`, validated server-side as middleware on `/api/v1/*`. It is
  a hard prerequisite for Task 6. It is added as a **second accepted scheme on the same
  `Authorization` header**, alongside `API_SHARED_SECRET` — not a replacement for it,
  which is what keeps the API closed while this lands. There is no Vercel SSO to remove
  first: SSO covers preview deployments only, and the production alias already answers
  unauthenticated requests with our own Express 401. See the corrected sequencing note
  in `.claude/docs/plan.md`. `API_SHARED_SECRET` must never reach this bundle.
- **The three screens.** Task 6.
- **Deep link.** `startapp` → `/location/:id`, with `/` pushed beneath it so
  `BackButton` reaches the list rather than closing the app. Task 7, spec in §2.
