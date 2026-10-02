# `apps/miniapp` — the WeatherTeam6 web app

Vite + React, static build. This is the project's only client.

It began as a Telegram Mini App and the directory name is the last of that. Phase 2 of
`docs/handoffs/leave-telegram-v1.md` made it a standalone web app: it authenticates with
its own token, carries its own back affordance, and installs to a home screen through a
PWA manifest. **Nothing here reads `Telegram.WebApp` any more.**

The design is `docs/handoffs/miniapp-design-v1.md` — the current design, open to change in conversation with the owner — with the
overrides listed in that handoff's § Explicit rule overrides — the ones that bite here
are the login UI and the in-app back arrow, both of which §2 and §8 forbade. Read it
before writing a screen; if a decision is not written there, it is not settled.

## What is here

| Path | Purpose |
| --- | --- |
| `src/theme/tokens.css.ts` | Web adapter for `@weatherteam6/design/tokens`. `type`, `shadow` and `layout` are React Native shaped and cannot be used directly (§0a). |
| `src/theme/styles.ts` | The per-entry `components` audit §0a asks for, plus the alert tint derived from `colors.poor` (the palette has `goodTint` and `fairTint` but no `poorTint`). |
| `src/theme/fonts.ts` | Maps the `expo-font` family names onto CSS families and fallback stacks. `BarlowCondensed` → `"Barlow Condensed"`. |
| `src/theme/cssVars.ts` | Renders the tokens as `:root` custom properties. Served through the `virtual:wt6-tokens.css` module built in `vite.config.ts`, so the block lands in the bundled stylesheet rather than being injected after first paint. |
| `src/theme/globals.css` | Gradient surface, `env(safe-area-inset-*)` padding, `100dvh`. The insets are only non-zero because `index.html` sets `viewport-fit=cover`. |
| `src/theme/webManifest.ts` | The PWA manifest, built from the tokens. Emitted by a plugin in `vite.config.ts`, not committed as JSON. |
| `src/routes/` | The four routes: `Login`, `LocationList`, `LocationDetail`, `AddLocation`. |
| `src/components/` | `DetailView` is the saved location's screen; `/add` has no weather preview, only a save form (`SaveBar`). |
| `src/hooks/` | Every API call. Components never call `fetch`. |
| `src/lib/api.ts` | The only place that calls `fetch`. Attaches `Authorization: Session <token>` and clears the token on a 401. |
| `src/lib/authToken.ts` | The session token and the only place it is stored. |
| `src/lib/backTarget.ts` | Where "back" goes, per route, as a pure function. |
| `src/lib/forecast.ts` | Today's row, date labels, and the source attribution — the logic that renders a wrong *value* rather than an error, so it is the part under test. |
| `src/lib/queryClient.ts` | React Query defaults fixed by §5. |
| `src/config/env.ts` | Where the API is: the page's own address in a production build, `VITE_API_BASE_URL` in development. Nothing secret may be read here — this bundle is public. |

**A production build calls its own address**, and `vercel.json` forwards `/api/...` to the
API. Across two origins every request carrying the session token paid a CORS preflight, a
second round trip of ~170 ms, 18 of them on every app open (2026-10-01); at one origin there
are none. `VITE_API_BASE_URL` is the API **origin** for development only (the dev server,
`check:ui`); `src/lib/api.ts` appends `/api/v1`, and a value that already ends in it is
accepted rather than doubled.

## Commands

```bash
npm run dev -w @weatherteam6/miniapp        # Vite dev server on :5173
npm run build -w @weatherteam6/miniapp      # tsc --noEmit && vite build → dist/
npm run preview -w @weatherteam6/miniapp    # serve dist/ on :4173
npm run test -w @weatherteam6/miniapp       # vitest, node environment
npm run icons -w @weatherteam6/miniapp      # regenerate public/icons/ from the tokens
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

**Live at https://weatherteam6.vercel.app.** Since Phase 2 of
`docs/handoffs/leave-telegram-v1.md` it is an ordinary web app: open the URL in any
browser, sign in, and optionally Add to Home Screen. It is no longer opened from a
Telegram menu button and no longer authenticates by `initData`.

The app is its own Vercel project, separate from the API. The settings it was created
with, since they are easy to get wrong if it is ever recreated:

1. New Vercel project on this repo, **Root Directory `apps/miniapp`**, with
   *Include source files outside of the Root Directory* enabled — the build imports
   `packages/design` and `packages/types` from the workspace root.
2. Framework preset **Vite**. (Unlike `apps/api`, which must be "Other".)
3. No API address to set: a production build calls its own `/api/...`, which `vercel.json`
   forwards to the API (its production URL is written there). A `VITE_API_BASE_URL` left in
   the project is ignored by a production build.
4. **Do not set `NODE_ENV`** — same reason as the API: npm would drop devDependencies
   and the root postinstall would lose `tsc`.
5. `vercel.json` here forwards `/api/...` to the API first, then rewrites every other path to `index.html`, which the four
   client-side routes need. Vercel matches the filesystem before applying a rewrite, so
   `/manifest.webmanifest` and `/icons/*.png` still serve as files.

The deployed app no longer needs CORS: it calls its own address. The API's CORS allowlist
(`apps/api/src/lib/cors.ts`) still matters for the dev server, which calls the API directly. `https://weatherteam6.vercel.app`
and `http://localhost:5173` are in the default list; a preview deployment needs
`CORS_ALLOWED_ORIGINS` to include `https://*.vercel.app`.

**Preview deployments are behind Vercel SSO** (`ssoProtection: all_except_custom_domains`),
so a preview URL answers 302 to a Vercel login page rather than this app. Driving a
preview with a browser needs either a protection-bypass secret or SSO off for previews —
both are security settings and are the owner's call.

## Installing it

`manifest.webmanifest` is generated at build time from the design tokens by the
`wt6-webmanifest` plugin in `vite.config.ts`; its source is `src/theme/webManifest.ts`.
The `<meta name="theme-color">` comes from the same place. Neither is a static file,
because both carry a colour and a colour written outside `packages/design` is a token
redefined inside an app.

`display: standalone` is what makes Add to Home Screen produce an app window rather than
a bookmark with an address bar.

**The service worker keeps the app shell, never the weather** (`src/theme/serviceWorker.ts`,
written into `dist/sw.js` by the `wt6-service-worker` plugin). It caches `index.html` and
the hashed build output so a cold open draws at once, with the list this device last saw
(`src/lib/rememberedLocations.ts`) and, on the same day, the weather its cards last showed
(`src/lib/rememberedCards.ts`, the header saying how old) while the live numbers load. API
calls are never intercepted, so every reading not labelled as remembered is live. A deploy reaches an
installed app one open late: the next open installs the new worker, the one after draws
the new build. Removing it takes a release of an `sw.js` that unregisters itself — a
browser keeps a worker whose script 404s. Registered only in a production build;
`check:ui` drives the dev server and does not exercise it.

Icons in `public/icons/` are **generated and committed**:

```bash
npm run icons -w @weatherteam6/miniapp      # regenerate public/icons/
npm run check:icons                         # from the repo root; CI runs this
```

`scripts/generate-icons.mjs` derives every colour from `@weatherteam6/design/tokens` and
writes the PNGs itself — there is no image library in this workspace and the icons are
flat shapes. `check:icons` fails when the committed bytes no longer match the tokens,
which is the only thing that would otherwise notice a palette change: the installed icon
is a surface nobody looks at twice.

## Auth

`POST /api/v1/auth/login` takes a username and passphrase and returns a signed token; the
app sends it as `Authorization: Session <token>`. `src/lib/authToken.ts` holds it in
`localStorage`, `src/hooks/useAuth.ts` exposes it to React, and `RequireAuth` in `App.tsx`
sends a signed-out user to `/login`.

Three things about that path that are easy to get wrong:

- **A 401 on an authenticated call clears the token**, in `src/lib/api.ts`. That clear is
  what `RequireAuth` reacts to — it does not observe status codes itself. A 503 does
  **not** clear: that means the server has no `AUTH_TOKEN_SECRET`, and signing the user
  out would send them to a login screen that cannot work either.
- **`apiLogin` is the one unauthenticated call.** A 401 from it means a wrong passphrase,
  not a dead session, so it must not clear anything.
- **`expires_at` is deliberately not stored.** A client-side expiry check on a device with
  a wrong clock would discard a token it had just been issued and bounce to `/login` with
  no error to explain it. The 401 is authoritative and costs one round trip.

Accounts are created with `npm run user:add` in `apps/api` and nowhere else. **There is no
self-serve signup** and the login screen must not offer one.

`API_SHARED_SECRET` must never reach this bundle — nothing about auth here is a
build-time value.

## Navigation

The client-side routes are listed in `App.tsx`: `/login`, `/`, `/location/:id` and its
editor and guidebook screens, `/add`, `/feedback`, and the bottom bar's sections.

**`/map` is its own chunk** (`React.lazy` in `App.tsx`), with MapLibre's worker beside it,
so the list's bundle does not carry MapLibre. Its tiles, glyphs, sprites and terrain load
straight from `tiles.openfreemap.org` and `s3.amazonaws.com`, the one exception to proxying
external calls (`.claude/rules/architecture.md`); `vercel.json`'s CSP names those two hosts
and `blob:` for the workers, and `deployConfig.test.ts` (in `apps/api`) pins it. A long-press
on the map opens `/add?lat=…&lon=…`.

Back is an in-app control in the screen header (`Screen`'s `onBack`), which
`miniapp-design-v1.md` §2 and §8 forbade — those rules assumed Telegram's `BackButton`,
and there is none in a browser. **The per-route back targets in §2 are unchanged** and
live in `src/lib/backTarget.ts` as a pure function, because two of them are not
navigations at all: back on the Hourly tab shows the Daily tab, and back from the `/add`
save form returns to the search *with its query and results intact*. Sending either to a
URL discards work the user can see on screen.
