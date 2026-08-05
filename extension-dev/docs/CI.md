# CI Test Infrastructure

## Overview

CyberControl uses GitHub Actions to validate architecture governance, unit/knowledge tests, and browser capability tests on every push and PR.

**Workflow:** `.github/workflows/architecture.yml`

## Job Matrix

| Job | Purpose | Duration | Dependencies |
|-----|---------|----------|--------------|
| `architecture` | Governance checks (patterns, frozen files, deps) | ~10s | None |
| `unit-and-knowledge` | Phase 0/1/2 logic tests | ~5s | None |
| `browser` | Playwright browser capability tests | ~30s | Chromium |

All three jobs run **in parallel**.

## Test Entry Points

| Command | Scope | Used By |
|---------|-------|---------|
| `node extension-dev/tests/run-all.mjs` | All tests (local) | Developer workstation |
| `node extension-dev/tests/ci-unit.mjs` | Unit + Knowledge only | CI `unit-and-knowledge` job |
| `node extension-dev/tests/ci-browser.mjs` | Browser tests only | CI `browser` job |

## Test Suite Inventory

### Unit & Knowledge (no dependencies)

| Suite | File | Phase | Tests |
|-------|------|-------|-------|
| Shared Modules | `test-shared-modules.js` | 0 | 25 |
| Integration | `test-integration.js` | 0 | 17 |
| Mapping Guards | `test-mapping-guards.js` | 0 | 17 |
| Model IR | `test-models.js` | 1 | 67 |
| Capabilities | `test-capabilities.js` | 1 | 45 |
| Runner | `test-runner.js` | 1 | 57 |
| Knowledge Store | `test-knowledge-store.js` | 2 | 35 |
| Scope Resolver | `test-scope-resolver.js` | 2 | 33 |
| Validation Engine | `test-validation-engine.mjs` | 2 | 60 |
| Versioning | `test-knowledge-versioning.mjs` | 2 | 25 |
| Knowledge Sync | `test-knowledge-sync.mjs` | 2 | 26 |

### Browser (requires Playwright + Chromium)

| Suite | File | Phase | Tests |
|-------|------|-------|-------|
| Browser Capabilities | `browser/run.mjs` | 1 | 107 |
| Real Widget Tests | `browser/run-real-widgets.mjs` | 1 | 49 |

### Browser Capability Coverage

The browser tests exercise these input types against fixture HTML pages:

- Text, textarea, password, email, number, tel, url, search
- Native select (single and multi), radio, checkbox
- File upload, date, time, datetime-local, month, week, range, color
- Buttons (submit, reset, button)
- Cascading dropdowns (state → district → block)
- ng-dropdown / ng-select custom widgets
- Select2 / Choices.js custom dropdowns
- Flatpickr / jQuery UI datepicker variants

## Adding Tests for Future Phases

### Phase 3 (Browser Perception)

1. Create `extension-dev/tests/test-perception.mjs`
2. Add to `ci-unit.mjs` if pure logic, or `ci-browser.mjs` if needs DOM
3. Add fixture HTML pages in `extension-dev/tests/fixtures/` for browser tests

### Phase 4 (Planner)

1. Create `extension-dev/tests/test-planner.mjs`
2. Add to `ci-unit.mjs` (planner logic is server-side, testable without browser)

### Phase 5 (Learning Engine)

1. Create `extension-dev/tests/test-learning.mjs`
2. Add to `ci-unit.mjs`

### Phase 6 (AI Reasoning)

1. Create `extension-dev/tests/test-ai-reasoning.mjs`
2. May need mock LLM responses; add to `ci-unit.mjs` with mocked fetch

### General Pattern

```js
// In ci-unit.mjs or ci-browser.mjs, add:
{ name: 'Phase N Tests', cmd: 'node extension-dev/tests/test-phase-n.mjs' },
```

No workflow changes needed — just add the test file and register it in the appropriate runner.

## Architecture Governance Checks

| Check | What it does | Fail behavior |
|-------|-------------|---------------|
| Forbidden patterns | Detects new inline LLM, isVisible, getLabel, matchOption | Hard fail |
| Frozen files | Warns when Phase 0 files are modified | Warning only |
| Dependency direction | Ensures shared/ doesn't reference autofill/ or drivers/ | Hard fail |
| Architecture report | Generates summary table in PR | Informational |

## Artifacts

On browser test failure, traces and screenshots are uploaded as GitHub Actions artifacts (`browser-test-traces`, retained 7 days).

## Local Development

```bash
# Run everything (recommended before push)
node extension-dev/tests/run-all.mjs

# Quick unit check
node extension-dev/tests/ci-unit.mjs

# Browser only (requires: cd extension-dev/tests/browser && npm install && npx playwright install chromium)
node extension-dev/tests/ci-browser.mjs
```
