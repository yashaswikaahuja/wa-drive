# Auth — HttpOnly Refresh-Cookie Migration (design)

**Status: planned (not started).** This is the design for sign-in fix **#4 option C**: move the
refresh token out of web-app JavaScript so an XSS can't steal it. Prereqs #1 (single-flight refresh)
and #2 (boot `/auth/me` validation) are already live.

> The quick win (#4 option B — shorten access TTL 24h → 15m) is a separate one-line config change,
> gated only on the v5.80 extension (with the fixed silent-refresh URL) reaching operators.

## Goal
Remove the **refresh token** from the web app's `localStorage` (XSS-readable). Keep a short-lived
access token as a Bearer; move the refresh token to an **HttpOnly, Secure cookie** the browser sends
automatically and JS cannot read.

## Token model

| | Today | Target (web) | Extension (unchanged) |
|---|---|---|---|
| access | localStorage, 24h, `Bearer` | memory/localStorage, **15m**, `Bearer` | `chrome.storage`, `Bearer` |
| refresh | localStorage, 7d, request body | **HttpOnly cookie**, 7d | `chrome.storage`, request body |

## Key decision — do NOT cookie-ify the extension
A `chrome-extension://` origin plus cookies means `SameSite`/host-permission fragility. So the cookie
migration is **web-app only**. The extension keeps token-in-storage + body refresh (already working
after the v5.80 `apiClient.refresh()` URL fix). `/auth/refresh` therefore accepts the refresh token
from **either** the cookie (web) **or** the body (extension).

This still achieves the goal: C removes the token from the **web XSS surface**. The extension's storage
is a separate threat surface (only the extension can read it), out of scope here.

## Changes by component

**`backend/src/modules/auth/routes.ts`**
- `login` · `google` · `register` → also `Set-Cookie` the refresh token (keep it in the body too, for the extension).
- `/refresh` → read refresh from `cookie ?? body` (cookie wins for web).
- `/logout` → clear the cookie (+ existing session revoke).
- add `cookie-parser` (or parse the `Cookie` header manually).

**Backend CORS** (`backend/src/index.ts`, `extension-service`, and the nginx front)
- `Access-Control-Allow-Origin: *` → **echo an allowlisted Origin** (`app.cybercontrol.fun`,
  `cybercontrol.fun`, `localhost` for dev).
- add `Access-Control-Allow-Credentials: true`.
- ⚠ `*` is illegal together with credentials — this must change wherever the CORS headers are set.

**Frontend**
- `store.ts`: stop persisting `refreshToken` (keep `accessToken` + `user`).
- `api.ts`: `axios` `withCredentials: true`; `/auth/refresh` sends **no body** (cookie carries it).
- `config`/env: access TTL → **15m**.
- `#1` single-flight refresh and `#2` boot `/me` already in place — they work as-is with the cookie.

**Extension** — **no change** (keeps body refresh). Only needs the v5.80 URL fix (already shipped).

## Cookie attributes
`app.cybercontrol.fun` → `api.cybercontrol.fun` is **same-site** (shared registrable domain
`cybercontrol.fun`), so `SameSite=Lax` is sent on cross-subdomain XHR (with `withCredentials`).

```
Set-Cookie: cc_refresh=<jwt>; HttpOnly; Secure; SameSite=Lax;
            Domain=.cybercontrol.fun; Path=/api/auth; Max-Age=604800
```

## Rollout — backward-compatible, staged
Each phase is independently safe and reversible.

```
P1 backend  set cookie ALSO (body still returned) + /refresh reads cookie??body + credentialed CORS
            → deploy. nothing breaks: web still uses body, extension unaffected.
P2 frontend withCredentials, stop persisting refresh, access TTL 15m
            → deploy (Vercel). web now uses the cookie; extension still body.
P3 (optional) suppress the body refresh token for WEB responses (a `webClient` flag),
            keep body tokens only for extension calls.
```

**Rollback:** backend → redeploy the prior image SHA (manual Deploy); frontend → Vercel dashboard
rollback. P1 is purely additive (cookie on top of existing body), so it can't break the current flow.

## Test plan (gate each phase)
- [ ] CORS preflight from the app origin returns the credentials headers.
- [ ] Login sets the cookie (DevTools → Application → Cookies; `HttpOnly` ✓, `Secure` ✓).
- [ ] App refresh works with `refreshToken` **removed** from `localStorage`.
- [ ] Logout clears the cookie; a subsequent `/refresh` returns 401.
- [ ] Cross-subdomain: the cookie is sent on an `app.` → `api.` XHR.
- [ ] **Extension autofill still authenticates** end-to-end (login → 15m wait → auto-refresh → fill). ← the risk gate.

## Risks
| Risk | Mitigation |
|---|---|
| CORS misconfig locks the app out | allowlist + test preflight in P1 before P2 |
| Cookie not set (wrong `Secure`/`Domain`) | verify in DevTools before shipping P2 |
| `SameSite` too strict → not sent | `Lax` is fine same-site; test cross-subdomain |
| Extension regression | P2 doesn't touch the extension; explicit extension test gate |
