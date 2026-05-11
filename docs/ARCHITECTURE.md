# CyberControl AutoFill — Architecture & System Documentation

_Version: 4.75 | Last updated: 2026-05-11_

---

## System Overview

CyberControl is a cyber cafe automation tool for Indian government forms. Operators receive student documents via WhatsApp → worker extracts structured profile data → backend stores it → operator opens a government form → Chrome extension fills it automatically.

### End-to-End Flow

```
WhatsApp messages → Worker extraction → Backend profiles
                                              ↓
Operator opens form → Extension extracts fields → Planner maps fields to profile
                                              ↓
                              Deterministic Runtime fills form
                                              ↓
                              Verification detects resets/failures
                                              ↓
                              Session + ReplayRecords posted to backend
                                              ↓
                              Learning engine updates mappings
```

---

## Architecture Principles

1. **Human accountability** — operator always reviews and submits. System never submits autonomously.
2. **Deterministic runtime** — execution is predictable and reproducible.
3. **Probabilistic planning** — field mapping and strategy selection may be probabilistic, but execution is deterministic.
4. **Empty is honest** — a missing value is safer than a wrong value.
5. **Bounded complexity** — hard resource budgets, no unbounded growth.
6. **Verification-first** — every fill is verified; unverified fills are not trusted.
7. **Observability everywhere** — every decision is traceable.

---

## Repository Structure

```
/opt/cybercontrol-hub/
├── extension/
│   ├── manifest.json              — v4.75, permissions: storage,activeTab,scripting,tabs,alarms
│   ├── popup.js                   — Planner + UI orchestrator
│   ├── popup.html                 — Extension popup UI
│   ├── background.js              — Teaching orchestration, SW lifecycle
│   ├── content.js                 — Content script shim
│   ├── autofill/
│   │   ├── extractor.js           — DOM → formFields[] + formKey + semanticFormKey
│   │   ├── mapper.js              — fuzzyMatch + aiMatch (Groq) + FIELD_ALIASES
│   │   └── executor.js            — Deterministic runtime (fills DOM)
│   └── icon.png
├── backend/
│   ├── dist/server.js             — Express API server
│   └── data/
│       ├── profiles.json          — Student profiles keyed by phone
│       ├── adapters.json          — Hostname-scoped adapters (legacy)
│       ├── widget_profiles.json   — Cross-site widget families
│       ├── form_mappings.json     — Learned field→profile mappings
│       ├── sessions.json          — FormSession audit log
│       └── teaching_pending.json  — Async teaching tasks
├── worker/                        — WhatsApp worker
├── frontend/                      — Dashboard UI
├── scripts/                       — Fix/deploy scripts
├── docs/
│   └── site-research.md           — Per-site research notes
├── deploy.sh                      — Deployment script
├── ecosystem.config.js            — PM2 config
└── inbox/                         — Operator inbox (text/image upload)
```

---

## Extension Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                        PLANNER                               │
│                                                              │
│  1. Extractor: DOM → formFields[] + semanticFormKey          │
│  2. Load saved mappings (semanticFormKey primary, formKey     │
│     fallback)                                                │
│  3. Fuzzy match: FIELD_ALIASES + label normalization         │
│  4. Groq AI: only for unmapped non-verify fields             │
│  5. ng-dropdown mapping: adapter-based custom dropdowns      │
│  6. Output: mapping{} + filledBySource{} = FillPlan          │
│                                                              │
├──────────────── PLANNER/RUNTIME BOUNDARY ────────────────────┤
│                                                              │
│                    DETERMINISTIC RUNTIME                      │
│                                                              │
│  executor.js: fillFormFieldsSequential(mapping, ...)         │
│  - STRATEGY_REGISTRY (5 named strategies)                    │
│  - WaitEngine (state-based waits for cascades)               │
│  - Post-fill verification (detects framework resets)         │
│  - ReplayRecord emission (DOM attribute bridge)              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    VERIFICATION LAYER                         │
│                                                              │
│  - 500ms post-fill check (el.value === expected)             │
│  - 6s delayed verification (detects Angular resets)          │
│  - failReason taxonomy: no-element, no-option,               │
│    custom-input-rejected, framework-reset                    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    OBSERVABILITY                              │
│                                                              │
│  - FormSession POST to /api/sessions                         │
│  - ReplayRecords with strategy, intent, source, confidence   │
│  - Version tagging (rv, sv, wv)                              │
│  - semanticFormKey + structural formKey                      │
│  - planSize metric                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Strategy Registry

| Strategy | Applies to | Verification |
|----------|-----------|--------------|
| `ng-dropdown-click` | Angular custom ng-dropdown | visual text in `.value-area` |
| `mat-select-click` | Angular Material mat-select | visual text in value span |
| `native-select` | Standard `<select>` | `el.value` or option text |
| `dwr-cascade-select` | ServicePlus DWR cascade | option text after AJAX |
| `text-input` | Text/email/tel inputs | `el.value === expected` |

---

## WaitEngine

Replaces fixed `setTimeout` delays with state-based waits:

- `waitForOptions(selector, minCount, timeout)` — waits for `<option>` elements to load
- `waitForElement(selector, timeout)` — waits for element to appear in DOM
- `waitForDOMQuiet(ms)` — waits for DOM mutations to stop
- Uses MutationObserver + polling fallback
- Proper cleanup (no observer/interval leaks)

---

## Semantic FormKey

```
Structural: hash(hostname + title + sorted_selectors)  — breaks on DOM changes
Semantic:   hash(hostname + sorted_normalized_labels)  — stable across updates
```

Semantic key is primary for mapping load/save. Structural key is fallback + debug metadata.

---

## FieldIntent

Each ReplayRecord is enriched with:
```json
{
  "selector": "#fatherFullName",
  "result": "filled",
  "strategy": "text-input",
  "intent": "father_name",
  "source": "saved",
  "confidence": 1,
  "rv": "4.75"
}
```

---

## Failure Taxonomy

| failReason | Meaning |
|-----------|---------|
| `no-element` | Element not in DOM when executor ran |
| `no-option` | Dropdown option not found |
| `custom-input-rejected` | Field rejects all programmatic input (date pickers) |
| `framework-reset` | Angular/React reset value after fill |
| `wait-timeout` | WaitEngine timed out waiting for options |

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sessions` | GET/POST | FormSession audit log |
| `/api/sessions/stats` | GET | Per-hostname fill rates |
| `/api/mappings/:key` | GET/POST | Learned field→profile mappings |
| `/api/adapters/:hostname` | GET/POST | Hostname-scoped adapters |
| `/api/widgets` | GET | Cross-site widget profiles |
| `/api/widgets/:family` | GET/POST | Specific widget family |
| `/api/teaching/pending` | GET/POST | Async teaching tasks |
| `/api/teaching/complete` | POST | Mark teaching task done |
| `/api/profiles` | GET | Student profiles |
| `/api/extension/version` | GET | Current extension version |
| `/api/extension/download` | GET | Download extension zip |
| `/inbox` | GET | Operator inbox page |
| `/inbox/send` | POST | Upload text/image |
| `/inbox/list` | GET | List inbox messages |

---

## Tested Sites

| Site | Fields Filled | Failures | Notes |
|------|--------------|----------|-------|
| RRB (rrbapply.gov.in) | 26 | 1 (DOB) | Angular, custom date picker |
| Bihar RTPS (serviceonline.bihar.gov.in) | 21+ | 0 | jQuery/DWR cascade, Hindi transliteration |
| SSC OTR (ssc.gov.in) | 11+ ng-dropdowns | 0 | Angular, ng-dropdown adapter |
| BTSC (btsc.pariksha.nic.in) | 21 | 0 | ASP.NET, native selects |
| IBPS (ibpsreg.ibps.in) | 9 | 0 | Banking recruitment |
| CET BEd (cetbed.ucanapply.com) | 19 | 0 | Education form |
| IRCTC (irctc.co.in) | 0 | 0 | Needs investigation |

---

## Teaching System

### Sync Teaching (current)
1. Popup detects unresolved custom dropdowns
2. Writes teach job to `chrome.storage.local`
3. Alarm wakes service worker
4. `teachOneField` injected in MAIN world
5. Badge shown → user clicks dropdown → selects value
6. Adapter saved to backend

### Async Teaching (Phase 5)
1. Unresolved fields saved to `/api/teaching/pending`
2. Operator can teach later without time pressure
3. Teaching tasks include hostname, label, type, operatorId

### Groq Auto-Teaching
1. Before manual badge, Groq analyzes DOM
2. Identifies trigger/option selectors
3. Attempts to fill automatically
4. Falls back to manual if Groq fails

---

## Operator Model

- `operatorId` attached to every session and teaching task
- Provenance tracking: who taught what, when
- Future: trust scoring based on correction rates

---

## Deployment

```bash
# Deploy new version
bash /opt/cybercontrol-hub/deploy.sh <version>

# PM2 processes
pm2 restart cybercontrol-hub    # Backend
pm2 restart cloudflare-tunnel   # Tunnel

# Cloudflare tunnel URL
https://survivor-scene-nest-championships.trycloudflare.com

# Extension download
https://survivor-scene-nest-championships.trycloudflare.com/api/extension/download
```

---

## Architecture Decisions

### MAIN world vs ISOLATED world
- **Executor runs in ISOLATED world** — deterministic, no framework interference
- **MAIN world used only for**: groqKey injection, teaching badge, Groq auto-teach
- **DOM attributes** bridge data between worlds (shared across all contexts)

### Planner/Runtime Separation
- Planner (popup.js): produces FillPlan from formFields + profile + savedMappings
- Runtime (executor.js): consumes FillPlan deterministically
- Planner never touches DOM. Runtime never makes semantic decisions.

### Tiered Execution
- Tier 1: Deterministic assignment (`niv.set.call` + events)
- Tier 2: Framework-compatible retry (MAIN world re-fill) — removed, caused instability
- Tier 3: Behavioral simulation (`execCommand`) — future, for interaction-controlled inputs

### Human Accountability
- System never submits forms
- Operator always reviews before submit
- Teaching requires human confirmation
- Corrections always override system memory

---

## Known Limitations

1. **DOB date pickers** — custom Angular inputs reject programmatic fill (`custom-input-rejected`)
2. **Form state corruption** — running autofill multiple times on same form causes Angular cross-field resets. Always test on fresh form.
3. **Groq hallucination** — AI sometimes returns wrong mappings. Confidence scoring mitigates.
4. **Correction observer** — can loop on some sites. `_cc_filling` flag prevents during executor run.

---

## Version History (Key Milestones)

| Version | Change |
|---------|--------|
| 4.19 | Teaching TDZ bug fixed — badge appears |
| 4.33 | WaitEngine replaces fixed delays |
| 4.34 | Replay records working (DOM attribute bridge) |
| 4.47 | Version tagging + failure taxonomy |
| 4.51 | SSC Education Qualification fixed |
| 4.58 | Post-fill verification (26/1 on RRB) |
| 4.69 | semanticFormKey as primary identity |
| 4.70 | FieldIntent enrichment in records |
| 4.72 | Groq filtered for meaningful fields only |
| 4.73 | Async teaching tasks |
| 4.74 | Widget profiles (cross-site families) |
| 4.75 | Operator model (provenance tracking) |
