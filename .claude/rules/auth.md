---
paths:
  - "apps/api/src/lib/auth/**"
  - "apps/api/src/lib/cors*"
  - "apps/api/src/middleware/**"
  - "apps/api/src/index.ts"
  - "apps/api/src/routes/{auth,account,feedback}.ts"
  - "apps/api/src/scripts/{addUser,checkAuth,checkInvites}.ts"
  - "packages/types/src/account*"
  - "apps/miniapp/src/lib/{api,authToken}*"
  - "apps/miniapp/src/hooks/{useAuth,useAccount}*"
  - "apps/miniapp/src/routes/{Login,Join}*"
  - "apps/miniapp/src/components/{InviteCard,EveryonesFeedbackCard}*"
---

# Auth rules

Tokens, accounts and invites, the login cap, CORS and Express hardening. Part of the
architecture rules; it loads only when a matching file is read or edited. The global rules,
and the index of every scoped file, are in `architecture.md`. Reasoning behind a rule: grep
`.claude/docs/session-archive.md`.

- **`/api/v1/*` is gated by `requireApiAuth`** (`middleware/apiAuth.ts`), the only setter of
  `req.userId`: `Session <token>` → the token's subject; `Bearer <API_SHARED_SECRET>` →
  `DEFAULT_USER_ID`. An unset `API_SHARED_SECRET` or `AUTH_TOKEN_SECRET` is a 503. Do not move
  the gate to Vercel. `/api/cron/*` keeps its own `CRON_SECRET` auth.
- **`createApp` hardens Express:** no `X-Powered-By`, `nosniff`, `frame-ancestors 'none'`,
  `Cache-Control: no-store`, a 32 kB JSON limit, body-parser failures as 400/413 in the
  envelope.
- **The owner reads and resolves everyone's open feedback** on Profile (`GET /feedback/all`,
  403 for anyone else; `POST /feedback/:id/resolve` skips the user filter for the owner
  alone; delete stays own-row only). `check:invites` covers it. Every other feedback route
  is the caller's own rows.
- Route handlers use `req.userId`, never `DEFAULT_USER_ID` — except `isOwner`
  (`lib/auth/invites.ts`), which compares the two: the owner is the account
  `DEFAULT_USER_ID` names, and an unset variable means nobody is.
- **No Clerk and no self-serve signup. The owner chooses every account** (owner decision
  2026-10-06): `npm run user:add`, or an invite link only the owner can mint from Profile
  (`POST /invites`, 403 for anyone else). A link works once and expires in
  `INVITE_TTL_MS` (48 hours, short because an unused link is a bearer credential); the
  code rides in the URL fragment and only its SHA-256 is stored, so the list
  (`GET /invites`, with `joined_as`) can never return one. `DELETE /invites/:id` cancels
  an unused link by deleting it; a used one is kept as the record of who joined. A
  forwarded link shows as an account the owner does not recognise on that list. `POST /api/v1/auth/redeem` is the second route above the gate: it claims the
  invite with a conditional update and creates the user in one transaction, so a taken
  username (409) leaves the link usable and a used, expired or unknown code is one 410.
  Usernames match `USERNAME_PATTERN`. A new passphrase passes `passphraseProblem`
  (`packages/types/account.ts`: length, repeats, the username, common words under digits
  and symbols), shared by redeem, the join screen and `user:add`; login never applies it. `check:invites` runs it against Postgres.
- **Login is capped per username, not per address** (`lib/auth/loginThrottle.ts`,
  owner decision 2026-10-06): `LOGIN_ATTEMPT_LIMIT` (10) attempts per
  `LOGIN_ATTEMPT_WINDOW_MS` (15 min), counted in `login_attempts` under a SHA-256 of the
  username, then a 429 for known and unknown names alike. Each attempt is recorded
  before scrypt, so a parallel burst cannot outrun the count; a success clears it.
  Per address would lock every reader out at once, because the web app reaches the API
  through Vercel's rewrite. **Two honest limits:** anyone who knows a username can keep
  it locked for as long as they keep guessing, and there is no token revocation
  (rotating `AUTH_TOKEN_SECRET` invalidates everything). Do not describe either as
  stronger than it is.
- **The token is not a JWT:** HMAC-SHA256 over a base64url payload, one algorithm.
  `lib/auth/token.ts` is pure and verifies over the raw payload string, never re-serialised
  claims.
- **An unknown username costs the same scrypt derivation as a known one**
  (`dummyPasswordHash`).
- **`POST /api/v1/auth/login` is mounted above the gate and must respond, never `next()`.**
- **CORS is an allowlist** (`lib/cors.ts`, overridden by `CORS_ALLOWED_ORIGINS`). One `*` may
  stand for a single host label, matched against `[a-z0-9-]+`.
