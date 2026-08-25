# Turborepo module audit

Snapshot of unused modules, coupling, and hardcoded vendor/company terms.
Generated during monorepo hardening (2026-08-25).

## 1. Unused / orphan modules

| Item | Status | Action taken / recommended |
|------|--------|----------------------------|
| Top-level `packages/*` | All **USED** by an app or another used package | None |
| Top-level `apps/*` | All **USED** as product entrypoints | None |
| Nested `@cc/background-*` package.json names | **ORPHAN names** (source still bundled by path) | **Removed** nested `package.json` files; sources kept under `@cc/background` |
| `packages/cc-background/bootstrap` | **DEAD** (unbundled duplicate of `background.js`) | **Deleted** |
| `@cybercontrol/svc-teach` beyond `setWsSend` | Soft-dead exports | Optional: wire teach handlers or trim exports later |

## 2. Dependency independence

**Good:** Runtime packages import via `@cybercontrol/*` / `@cc/*` — no cross-package `../../../apps/` escapes found in product code.

**Remaining coupling (build/tooling):**

| Location | Issue |
|----------|--------|
| `apps/*/scripts/build-dist.mjs` | Assumes `packages/<name>` on disk |
| `packages/cc-mapper/build.mjs` | Fallback path into `apps/extension/scripts/...` |
| `tools/forbidden-deps-check.mjs` | Still points at pre-`apps/` roots |
| `corpus/validate.js` | Points at deleted discrete `extractor.js` |

## 3. Hardcoded company / vendor terms (packages)

| Term / default | Where | Generalization |
|----------------|-------|----------------|
| `.cybercontrol.fun` cookie domain | `backend-auth` | `COOKIE_DOMAIN` env (**done**) |
| Email/WA “CyberControl” + app URL | `backend-communications` | `BRAND_NAME` + `APP_ORIGIN` (**done**) |
| `GROQ_API_KEY` as only LLM name | `backend-core`, docs, UI | `AI_API_KEY` / `LLM_API_KEY` with Groq alias (**done** in core) |
| Hardcoded remove.bg API key default | `backend-core` | Empty default (**done** — was a secret leak) |
| Prod tailnet `WA_SERVICE` default | `backend-core` | Empty — require env (**done**) |
| `PARENT_URL` → `api.cybercontrol.fun` | `wa-service` | Empty / `API_ORIGIN` (**done**) |
| Trusted origin `app.cybercontrol.fun` | `cc-background/auth`, `content.js` | Injectable via `__CC_APP_ORIGIN` / `__CC_PUBLIC_DOMAIN` (**done**) |
| `groqKey` / `_cc_groq_key` / `learnedBy: 'groq-ai'` | `cc-mapper`, `cc-executor`, teach | Renamed to `llmKey` / `_cc_llm_key` / `learnedBy: 'llm'` with aliases (**done**) |
| `/api/settings/groq-key` | `apps/backend` | Alias of `/api/settings/llm` (**done**) |
| Frontend/CLI/WA hardcoded `api.cybercontrol.fun` | frontend, cyb-cli, wa ecosystem, compose | Driven by `PUBLIC_DOMAIN` / `VITE_PUBLIC_DOMAIN` (**done**) |

Product branding (`CyberControl` name) in `apps/frontend`, `apps/landing`, popup copy is expected — only domains are generic.

## 4. Env vars to set in prod (general terms)

```bash
BRAND_NAME=CyberControl
PUBLIC_DOMAIN=cybercontrol.fun   # drives app./api./cookie/email defaults
# Optional overrides:
# APP_ORIGIN=https://app.example.com
# API_ORIGIN=https://api.example.com
# COOKIE_DOMAIN=.example.com
AI_API_KEY=...          # preferred; GROQ_API_KEY still works as alias
AI_PROVIDER=groq        # optional
WA_SERVICE=http://cybercontrol-wa:3100
PARENT_URL=https://api.cybercontrol.fun
REMOVE_BG_API_KEY=...   # optional; no longer defaulted in source
```

## 5. Follow-ups

1. ~~Rename extension LLM identifiers (`groqKey` → `llmKey`)~~ — done with `/api/settings/llm` + compat `/groq-key`.
2. Vision provider registry in `backend-documents/extraction.ts` (URLs still vendor-specific).
3. Resolve workspace package roots by name in `build-dist.mjs`.
4. Retarget `tools/forbidden-deps-check.mjs` + `corpus/validate.js` to `apps/` + `@cc/*`.
