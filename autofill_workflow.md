┌─────────────────────────────┐
│   Operator on form page     │
│  (e.g., bed.upessc.org)     │
└─────────────┬───────────────┘
              │ 1. Clicks extension icon
              ▼
┌─────────────────────────────┐      ┌──────────────────────────┐
│          POPUP UI           │      │     Chrome Storage        │
│  ┌───────────────────────┐  │      │  - backendUrl            │
│  │ • Settings (Backend   │  │      │  - groqApiKey            │
│  │   URL, Groq Key)      │  │      │  - selectedProfileId     │
│  │ • Profile selector    │  │      └──────────────────────────┘
│  │ • "Auto-fill This     │  │
│  │   Form" button        │  │
│  │ • Unresolved list     │  │
│  └───────────────────────┘  │
└─────────────┬───────────────┘
              │ 2. On open:
              ├─ fetch profiles from backend (GET /api/profiles)
              ├─ version check (GET /api/extension/version)
              └─ run scanner on active tab (via executeScript)
                  │
                  ▼
┌──────────────────────────────────────────────┐
│  POPUP SCANNER (runs in page context)       │
│  • Query all possible form fields &         │
│    custom dropdowns (div.relative, etc.)    │
│  • Skip native <select> wrappers            │
│  • For div.relative with button>span →      │
│    treat as dropdown even if no options     │
│  • Extract labels, check against            │
│    profile keys via LABEL_MAP               │
│  • Return matched / unresolved fields       │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  OPERATOR SELECTS PROFILE & CLICKS AUTOFILL │
└──────────────────────┬───────────────────────┘
                       │ 3. popup.js sends message to
                       │    background.js:
                       │    { action: "autofill",
                       │      profileId, tabUrl }
                       ▼
┌──────────────────────────────────────────────┐
│            BACKGROUND.JS (Service Worker)    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ 1. Fetch adapter for URL:            │    │
│  │    GET /api/adapters?url=...        │    │
│  └──────────────┬───────────────────────┘    │
│                 │                            │
│        ┌────────┴──────────┐                 │
│        ▼                   ▼                 │
│   Adapter found      No adapter              │
│        │                   │                 │
│        │           ┌───────┴──────────┐      │
│        │           │ Run AI fallback  │      │
│        │           │ (Groq Vision) or │      │
│        │           │ start TEACH      │      │
│        │           │ session if user  │      │
│        │           │ wants to teach   │      │
│        └───────────┴──────────────────┘      │
│                 │                            │
│  ┌──────────────┴──────────────────────┐     │
│  │ 2. Send fill command to content.js │     │
│  │    with adapter + profile data     │     │
│  └────────────────────────────────────┘     │
└──────────────────────┬───────────────────────┘
                       │ 4. chrome.tabs.sendMessage or
                       │    scripting.executeScript
                       ▼
┌──────────────────────────────────────────────────┐
│              CONTENT.JS (Content Script)         │
│  Receives { adapter, profile } and calls:       │
│  ┌──────────────────────────────────────────┐   │
│  │ AUTOFILL MODULES                         │   │
│  │                                          │   │
│  │  EXTRACTOR.JS                            │   │
│  │  • extractFormFieldsWithFingerprint()    │   │
│  │  • Reads all inputs/selects/textareas    │   │
│  │  • Skips hidden/nav/verify fields        │   │
│  │  • Strips non‑English labels             │   │
│  │  • Returns structured field objects      │   │
│  │                                          │   │
│  │  MAPPER.JS                               │   │
│  │  • fuzzyMatch(field, profileKeys)        │   │
│  │  • Uses FIELD_ALIASES (bilingual)        │   │
│  │  • DOB split for DAY/MONTH/YEAR          │   │
│  │  • AI match (Groq) if confidence low     │   │
│  │  • Returns field→profileKey mappings     │   │
│  │                                          │   │
│  │  EXECUTOR.JS (main fill engine)          │   │
│  │  • fillFormFieldsSequential()            │   │
│  │  • Text fields: set value + events       │   │
│  │  • Custom dropdowns:                     │   │
│  │    ┌────────────────────────────────────┐│   │
│  │    │ Sequential ngChain (promise chain) ││   │
│  │    │ for each dropdown:                 ││   │
│  │    │ 1. Snapshot existing overlays      ││   │
│  │    │ 2. Click triggerSelector           ││   │
│  │    │ 3. START MutationObserver on:      ││   │
│  │    │    - root element (component)      ││   │
│  │    │    - document.body (for teleported ││   │
│  │    │      div.fixed overlays)           ││   │
│  │    │ 4. waitStable() (up to 1200ms)     ││   │
│  │    │ 5. Find options via:               ││   │
│  │    │    - addedNodes with visible li    ││   │
│  │    │    - nearest overlay with li       ││   │
│  │    │    - adapter.optionsContainer      ││   │
│  │    │ 6. Select matching option          ││   │
│  │    │    (simulate pointer/mouse events) ││   │
│  │    │ 7. Verify fill: poll up to 3000ms  ││   │
│  │    │    (text change, overlay gone,     ││   │
│  │    │     ariaSelected, etc.)            ││   │
│  │    │ 8. Trace [CC] for debugging       ││   │
│  │    └────────────────────────────────────┘│   │
│  │  • Returns { filled, failed[] }         │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────┬───────────────────────────┘
                       │ 5. Result sent back to background.js
                       ▼
┌──────────────────────────────────────────────┐
│            BACKGROUND.JS                     │
│  • Receives fill results                     │
│  • Forwards to popup.js                      │
│  • Also sends DOM snapshot (captured by      │
│    popup's debug capture) to backend:        │
│    POST /api/debug/form                      │
└──────────────────────┬───────────────────────┘
                       │ 6. popup.js displays:
                       │    ✔ 12 filled
                       │    ⚠ 3 unresolved (reasons)
                       │
                       ▼
              ┌────────────────────┐
              │  POPUP UI updated  │
              │  • Unresolved list │
              │  • "Teach Failed   │
              │    Fields" button  │
              └────────┬───────────┘
                       │ 7. Operator clicks Teach
                       ▼
┌──────────────────────────────────────────────────┐
│  BACKGROUND.JS – TEACH SESSION                   │
│  • For each unresolved field:                    │
│    ┌────────────────────────────────────────┐    │
│    │ 1. Identify component type             │    │
│    │ 2. Get display text (getDisplayText()) │    │
│    │    handles Vue, Angular, ng‑select...  │    │
│    │ 3. If root unclear → purple overlay    │    │
│    │    (click‑to‑identify)                 │    │
│    │ 4. AI-assisted identification (Groq)   │    │
│    │ 5. Start MutationObserver on both      │    │
│    │    root AND document.body              │    │
│    │ 6. Operator manually maps the field    │    │
│    │    to a profile key (or selects        │    │
│    │    option in dropdown)                 │    │
│    │ 7. Capture interaction pattern:        │    │
│    │    triggerSelector, optionSelector,    │    │
│    │    verifySelector, optionsContainer    │    │
│    │ 8. Send adapter to backend:            │    │
│    │    POST /api/adapters (with url)       │    │
│    └────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│          BACKEND (Express on GCP VM)              │
│  • Stores adapters with URL patterns             │
│  • Adapters are shared across all operators      │
│  • Endpoints:                                    │
│    GET /api/adapters?url=...                     │
│    POST /api/adapters (save/update)              │
│    GET /api/profiles                             │
│    GET /api/extension/version                    │
│    POST /api/debug/form (stores DOM capture)     │
│  • Future: Playwright validation of adapters     │
└──────────────────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────────┐
              │  ADAPTER MANAGER   │
              │  (Vercel Frontend) │
              │  /adapters page    │
              │  • View all        │
              │  • Edit / Delete   │
              │  • Add new adapter │
              └────────────────────┘