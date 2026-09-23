# `apps/miniapp` — the WeatherTeam6 web app

Vite + React, static build. This is the project's only client.

It began as a Telegram Mini App and the directory name is the last of that. Phase 2 of
`docs/handoffs/leave-telegram-v1.md` made it a standalone web app: it authenticates with
its own token, carries its own back affordance, and installs to a home screen through a
PWA manifest. **Nothing here reads `Telegram.WebApp` any more.**

The design contract is `docs/handoffs/miniapp-design-v1.md` and it is binding, with the
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
| `src/components/` | `DetailView` is shared by saved detail and the add flow's preview — the preview is that screen in unsaved mode, which is why `/add` is the only new screen §12 needed. |
| `src/hooks/` | Every API call. Components never call `fetch`. |
| `src/lib/api.ts` | The only place that calls `fetch`. Attaches `Authorization: Session <token>` and clears the token on a 401. |
| `src/lib/authToken.ts` | The session token and the only place it is stored. |
| `src/lib/backTarget.ts` | Where "back" goes, per route, as a pure function. |
| `src/lib/forecast.ts` | Today's row, date labels, and the source attribution — the logic that renders a wrong *value* rather than an error, so it is the part under test. |
| `src/lib/queryClient.ts` | React Query defaults fixed by §5. |
| `src/config/env.ts` | `VITE_API_BASE_URL`. Nothing secret may be read here — this bundle is public. |

`VITE_API_BASE_URL` is the API **origin**; `src/lib/api.ts` appends `/api/v1`. A value
that already ends in `/api/v1` is accepted rather than doubled, because three separate
docs describe this variable and none of them is unambiguous about it.

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
3. Environment variable `VITE_API_BASE_URL` = the API's production URL. It is inlined
   into the bundle at build time and is public.
4. **Do not set `NODE_ENV`** — same reason as the API: npm would drop devDependencies
   and the root postinstall would lose `tsc`.
5. `vercel.json` here already rewrites every path to `index.html`, which the four
   client-side routes need. Vercel matches the filesystem before applying a rewrite, so
   `/manifest.webmanifest` and `/icons/*.png` still serve as files.

The API's CORS allowlist (`apps/api/src/lib/cors.ts`) must contain this origin, or the
browser blocks every call before the auth header is read. `https://weatherteam6.vercel.app`
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
a bookmark with an address bar. **There is no service worker** — push is parked, and one
with nothing to cache is a cache-invalidation bug waiting to happen. The app therefore
does not work offline, which is honest: every screen is a live forecast.

**What that costs, precisely.** Chrome dropped the service-worker requirement for
installing from its own menu (Chrome 108 on mobile, 112 on desktop), so *Install app* /
*Add to Home Screen* works and produces a standalone window. What still requires a
`fetch` handler is the **automatic install prompt** — Chrome will never offer
installation by itself, so the user has to find it in the menu. iOS Safari has no
automatic prompt either way and honours `display: standalone` from the manifest since
iOS 16.4. Adding a service worker purely to earn the prompt is the empty-fetch-handler
antipattern Chrome removed the requirement over; if the prompt is wanted, it should come
with a real caching story.

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

Four client-side routes: `/login`, `/`, `/location/:id`, `/add`.

Back is an in-app control in the screen header (`Screen`'s `onBack`), which
`miniapp-design-v1.md` §2 and §8 forbade — those rules assumed Telegram's `BackButton`,
and there is none in a browser. **The per-route back targets in §2 are unchanged** and
live in `src/lib/backTarget.ts` as a pure function, because two of them are not
navigations at all: back on the Hourly tab shows the Daily tab, and back in the `/add`
preview returns to the search *with its query and results intact*. Sending either to a
URL discards work the user can see on screen.
