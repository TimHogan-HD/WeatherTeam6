# ARCHIVED — 2026-08-26

`apps/mobile` (React Native + Expo) is **archived**. The code stays in the repo; it has
left the build.

Direction changed on **2026-07-31**: WeatherTeam6's client is the Telegram bot plus the
Telegram Mini App (`apps/miniapp`), which is the real, complete implementation of every
user-facing screen. This app was superseded then, and formally removed from the build in
Crossover Task 7 on **2026-08-26**.

## Do not add features here

Anything worth keeping gets **ported into `apps/miniapp`**, not revived here. The old
Mobile-First Mandate in `.claude/rules/architecture.md` (never use WebView,
`react-native-maps` for every map, native `.tsx` always real) is superseded and no longer
applies.

## What "left the build" means

`apps/mobile/package.json` no longer declares `build`, `dev`, `typecheck`, `lint` or
`test` scripts. Turbo runs whatever scripts a workspace member declares, so with none
present this workspace is skipped by `turbo run build|typecheck|lint|test|dev` entirely.

**The fix is in this file's `package.json`, not `turbo.json`.** The
`@weatherteam6/mobile#build` override that used to sit in `turbo.json` only zeroed the
task's *outputs* — the package's own `build` script (`tsc --noEmit`) still ran. That
override was removed as dead configuration at the same time; deleting it on its own
would have made the workspace fall through to the generic `build` task and keep running
`tsc --noEmit`.

Still in place, deliberately:

- The workspace itself, in the root `workspaces` glob (`apps/*`), so `npm install`
  keeps its dependencies resolvable.
- The root `postinstall` step `scripts/fix-expo-router-link.mjs`, which is an
  install-time symlink for EAS/Metro and is non-fatal everywhere else.
- The `apps/mobile/**` block in `eslint.config.mjs`, so a manual `npx eslint apps/mobile`
  still lints correctly. It is simply no longer run by CI.

## Running it anyway

The Expo commands are still declared, so the app can be launched by hand:

```bash
npm run start -w @weatherteam6/mobile     # expo start
npm run ios   -w @weatherteam6/mobile
npm run android -w @weatherteam6/mobile
```

Typecheck it by hand with `npx tsc --noEmit` from this directory. Neither is run by CI
and neither is expected to keep passing as the shared packages evolve.

## Known constraints if it is ever revived

- `expo-router` must match the Expo SDK major version — SDK 56 needs `expo-router@~56.0.0`.
  A `Cannot find module 'expo-router/internal/routing'` crash is a version mismatch, not
  a code bug: that path exists only in expo-router v56+, and typecheck passes either way.
- `expo start --tunnel` does not work from the cloud dev environment; testing was done
  locally via Expo Go.

## Historical gotchas (moved out of the root `CLAUDE.md`, 2026-08-26)

These were always-loaded in every session long after this workspace left the build. They are
kept here because they are still true of this code, and are only relevant to someone working
on it.

**Expo Router version must match the Expo SDK major version.** For SDK 56 you need
`expo-router@~56.0.0`. If Metro crashes with `Cannot find module 'expo-router/internal/routing'`,
the router version is wrong.

**`expo-router/internal/routing` crash is a version mismatch, not a code bug.** That path only
exists in expo-router v56+; earlier versions crash silently. typecheck passes — it's runtime-only.

**Cloud dev environment blocks ngrok tunnels.** `expo start --tunnel` fails here. Mobile
testing had to be done locally via Expo Go.

**`EXPO_PUBLIC_SHADEMAP_KEY` and `EXPO_PUBLIC_API_BASE_URL`** are read by this app at bundle
time and are archived along with it.
