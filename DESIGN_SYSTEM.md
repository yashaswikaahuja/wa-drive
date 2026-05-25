# CyberControl Design System

**Status:** Active v1.1.
**Last reviewed:** 2026-05-26.
**Inspiration:** Zerodha (calm, professional, dense-where-needed, restrained).
**Goal:** A unified visual language for an operator running CyberControl 8 hours/day under bright cybercafe lighting, with optional dark mode for evening shifts.

---

## 1. Design philosophy

**Calm > exciting.** The instrument-panel feel of Zerodha. The customer's data and tasks are the foreground; the app fades into the background.

**Whitespace is content.** The current app is cluttered because every pixel is filled. We show fewer things, larger, with breathing room.

**Type carries the hierarchy.** Most "design" is just font sizes and weights done right. Borders and shadows are minimal.

**One color does the work.** Primary action color is the brand. Everything else is gray. Color shouldn't fight for attention.

**Light by default, dark for evening.** Cybercafes have bright lighting. Light theme reduces eye fatigue. But evening shifts and night operators get a dark mode toggle that uses the *same component shapes*, just inverted colors.

**Borders > shadows for separation.** A faint border on a white card sitting on `#fafafa` page background already creates visible depth. Shadows are reserved for elevated interactions (hovered cards, modals, dropdowns) — not decoration.

**Responsive by default.** Desktop-first in design, but every screen works on mobile and tablet. No "this only works on desktop." Operators use tablets for chat workflows; owners check dashboards from phones; admins review data on the go. Mobile-first CSS, progressively enhanced for larger screens. Specifics in §20.

---

## 2. Color palette

We define tokens, not raw colors. Each token has a clear semantic role.

### 2.1 Primary (brand + main action)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--cc-primary` | `#1d4ed8` | `#3b82f6` | Default primary buttons, brand accents, links |
| `--cc-primary-hover` | `#1e40af` | `#60a5fa` | Hover state |
| `--cc-primary-pressed` | `#1e3a8a` | `#2563eb` | Mousedown / active |
| `--cc-primary-soft` | `#eff6ff` | `#1e3a8a` | Selected row, primary tint background |
| `--cc-primary-bg` | `#dbeafe` | `#1e40af` | Stronger background tint, badges |
| `--cc-focus-ring` | `#60a5fa` | `#93c5fd` | 2px focus outline (always visible against bg) |

### 2.2 Neutrals (the workhorses — used 90% of the time)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--cc-bg` | `#fafafa` | `#0f172a` | Page background |
| `--cc-surface` | `#ffffff` | `#1e293b` | Card, panel, modal background |
| `--cc-surface-hover` | `#f5f5f5` | `#334155` | Hovered surface (list rows, ghost buttons) |
| `--cc-surface-pressed` | `#ebebeb` | `#475569` | Pressed surface |
| `--cc-border` | `#e8e8e8` | `#334155` | Default border (cards, inputs, table rows) |
| `--cc-border-strong` | `#d0d0d0` | `#475569` | Stronger border (input default, dividers) |
| `--cc-border-focus` | `#1d4ed8` | `#3b82f6` | Focused input border |
| `--cc-text` | `#1a1a1a` | `#f1f5f9` | Primary text |
| `--cc-text-secondary` | `#5e5e5e` | `#cbd5e1` | Captions, secondary info |
| `--cc-text-tertiary` | `#9b9b9b` | `#94a3b8` | Hints, placeholders, meta |
| `--cc-text-disabled` | `#c4c4c4` | `#64748b` | Disabled text |
| `--cc-text-on-primary` | `#ffffff` | `#ffffff` | Text on primary buttons |

### 2.3 Status (use sparingly — never decorative)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--cc-success` | `#10b981` | `#34d399` | Confirmations, "ready", saved state |
| `--cc-success-soft` | `#d1fae5` | `#064e3b` | Success bg tint |
| `--cc-warning` | `#f59e0b` | `#fbbf24` | Needs attention, low confidence |
| `--cc-warning-soft` | `#fef3c7` | `#78350f` | Warning bg tint |
| `--cc-danger` | `#dc2626` | `#ef4444` | Destructive only — never decorative |
| `--cc-danger-soft` | `#fee2e2` | `#7f1d1d` | Danger bg tint, error toasts |
| `--cc-info` | `#0891b2` | `#22d3ee` | Informational, neutral |
| `--cc-info-soft` | `#cffafe` | `#164e63` | Info bg tint |

### 2.4 Forbidden anti-patterns

- ❌ More than 4 shades of gray on a single screen.
- ❌ Brand blue used for non-primary things (no blue captions, no blue borders unless input is focused).
- ❌ Gradient backgrounds.
- ❌ Hard-coded hex values in components — always use tokens.
- ❌ Status colors used for emphasis ("look, this section is important so let's color it red"). Status colors mean status, period.

---

## 3. Theme switching

Both themes are first-class. Implementation:

```css
/* Light theme is the default */
:root { /* light values */ }

/* Dark mode via attribute (user preference, persisted to localStorage) */
[data-theme="dark"] { /* dark values */ }

/* Optional: respect system preference if no explicit choice */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* dark values */ }
}
```

Toggle: Settings page has Light / Dark / System choice. Default = System. Persist to `localStorage('cc-theme')`. Apply on app boot.

Components must NEVER hardcode colors. Always tokens. Tokens swap when theme attribute changes; components automatically adjust.

---

## 4. Typography

### 4.1 Font family

**Inter** primary (clean, neutral, excellent for UI + data). Variable weight `100-900` available; we use only 400, 500, 600.

Fallback: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

Monospace (codes, hashes, IDs): **JetBrains Mono** with fallback `ui-monospace, SFMono-Regular, Menlo, monospace`.

Loaded via `<link rel="preconnect" href="https://rsms.me">` + Inter from `rsms.me/inter/inter.css` (zero-config CDN).

### 4.2 Scale

| Token | Size | Weight | Line-height | Use |
|---|---|---|---|---|
| `text-display` | 32px | 600 | 1.2 | Page hero number, dashboard total |
| `text-h1` | 24px | 600 | 1.3 | Page title |
| `text-h2` | 18px | 600 | 1.3 | Section title |
| `text-h3` | 15px | 600 | 1.4 | Card / panel title |
| `text-body` | 14px | 400 | 1.5 | Default body text, table rows |
| `text-body-strong` | 14px | 500 | 1.5 | Emphasized body |
| `text-small` | 13px | 400 | 1.5 | Captions, secondary info |
| `text-label` | 11px | 500 | 1.4 | Form labels, badges, sidebar group titles. Letter-spacing 0.04em, often uppercase. |
| `text-mono` | 13px | 400 | 1.5 | Code, IDs, file hashes |

### 4.3 Rules

- One font weight per usage tier. Body = 400. Headings = 600. Labels = 500.
- No italic except quoted strings (rare).
- No all-caps except `text-label`.
- Line-height tighter for headings (1.2–1.4), looser for body (1.5).

---

## 5. Spacing

8px base scale. Strictly limited choices:

| Token | px |
|---|---|
| `space-0.5` | 2 |
| `space-1` | 4 |
| `space-2` | 8 |
| `space-3` | 12 |
| `space-4` | 16 |
| `space-5` | 20 |
| `space-6` | 24 |
| `space-8` | 32 |
| `space-10` | 40 |
| `space-12` | 48 |
| `space-16` | 64 |

| Use | Spacing |
|---|---|
| Inline padding (button) | `space-3` × `space-2` (12 × 8) |
| Card padding | `space-6` (24) |
| Section gap | `space-8` (32) |
| Page padding | `space-6` (24) mobile / `space-8` (32) desktop |
| Gap between cards | `space-4` (16) |
| Gap between form fields | `space-4` (16) |
| Gap between paragraphs | `space-3` (12) |
| Sidebar item padding | `space-3` × `space-4` (12 × 16) |

---

## 6. Elevation (shadows)

**Used sparingly.** Default = no shadow. Borders create depth.

| Token | Value | Use |
|---|---|---|
| `cc-shadow-sm` | `0 1px 2px 0 rgba(0,0,0,0.04)` | Subtle, hovered card |
| `cc-shadow-md` | `0 4px 8px -2px rgba(0,0,0,0.06), 0 2px 4px -1px rgba(0,0,0,0.04)` | Dropdowns, popovers |
| `cc-shadow-lg` | `0 12px 24px -4px rgba(0,0,0,0.10), 0 4px 8px -2px rgba(0,0,0,0.06)` | Modals, picker overlays |

Dark mode uses lower-opacity shadows (e.g., `0 1px 2px 0 rgba(0,0,0,0.4)`) to maintain visibility.

---

## 7. Borders & radius

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 4px | Buttons, inputs, badges, small chips |
| `radius-md` | 8px | Cards, modals, panels |
| `radius-lg` | 12px | Hero cards (rare) |
| `radius-full` | 9999px | Avatar, status dots, pill toggles |

Border width defaults to 1px. Use 2px only for focus states.

---

## 8. Focus & accessibility

**Operators work 8+ hours. Focus indication must be loud and clear.**

```css
.cc-focus-ring {
  outline: none;
  box-shadow: 0 0 0 2px var(--cc-surface), 0 0 0 4px var(--cc-focus-ring);
  /* 2px gap (surface color) + 2px ring color = clearly visible without overlapping element */
}
```

- ALL interactive elements must show focus ring on `:focus-visible`.
- Min hit target: 36×36px (8px from sibling). Larger for primary actions.
- Color contrast: WCAG AA minimum (4.5:1 for body text, 3:1 for headings/icons against bg).
- Never communicate state with color alone — always pair with icon, text, or pattern.

---

## 9. Components (specs)

### 9.1 Button

**Variants:**

| Variant | Bg | Text | Border | Use |
|---|---|---|---|---|
| Primary | `cc-primary` | white | none | One per screen, the obvious next action |
| Secondary | `cc-surface` | `cc-text` | `1px solid cc-border-strong` | Next-to-primary, less important |
| Ghost | transparent | `cc-text` | none | Sidebar items, link-like actions |
| Danger | `cc-danger` | white | none | Confirm-destructive only |
| Subtle | `cc-surface-hover` | `cc-text` | none | Tertiary toolbar actions |

**States** (all variants):

| State | Effect |
|---|---|
| Default | as defined |
| Hover | bg → variant's hover token |
| Pressed | bg → variant's pressed token |
| Focused | + 2px focus ring |
| Disabled | opacity 0.5, cursor `not-allowed`, no hover effect |
| Loading | spinner replaces icon, button non-interactive |

**Sizes:**
- `sm`: padding `8px 12px`, text 13px, height 32px
- `md`: padding `10px 16px`, text 14px, height 40px (default)
- `lg`: padding `12px 20px`, text 15px, height 44px (rare, primary CTAs)

**Anti-rules:**
- No transform / scale on hover.
- No glow, no gradient, no rounded-full unless explicitly a chip.
- One primary button per screen, max.
- Icon-only buttons MUST have `aria-label` and tooltip.

### 9.2 Card / Surface

```
bg: var(--cc-surface)
border: 1px solid var(--cc-border)
border-radius: 8px (radius-md)
padding: 24px (space-6)
shadow: none (default), cc-shadow-sm on hover (interactive cards only)
```

Interactive cards: cursor pointer, hover bg → `cc-surface-hover`, optional `cc-shadow-sm`.

### 9.3 Input / Textarea / Select

```
bg: var(--cc-surface)
border: 1px solid var(--cc-border-strong)
border-radius: 4px (radius-sm)
padding: 10px 12px
text: 14px, color cc-text
placeholder: cc-text-tertiary
height: 40px (md size, default)
```

States:
- Default: as above
- Hover: border `cc-text-tertiary`
- Focus: border `cc-border-focus` + 2px focus ring
- Disabled: bg `cc-bg`, text `cc-text-disabled`, border `cc-border`
- Error: border `cc-danger`, error message below in `cc-danger`, 13px

### 9.4 Table / DataList

Header row:
- bg `cc-bg`, text 13px weight 500 `cc-text-secondary`
- Padding `12px 16px`
- Border-bottom `1px solid cc-border`

Body row:
- bg `cc-surface`, text 14px `cc-text`
- Padding `12px 16px`
- Border-bottom `1px solid cc-border` (subtle)
- Hover: bg `cc-surface-hover`
- Selected: bg `cc-primary-soft`, no extra border
- No zebra striping

### 9.5 Sidebar / Nav

- Width: **240px**
- Bg: `cc-surface`
- Border-right: `1px solid cc-border`
- Item: 40px tall, padding `12px 16px`, gap 12px between icon & label
- Icon: 18×18 Lucide, monochrome
- Label: 14px, weight 500 (when active), 400 (default)
- Default: text `cc-text`, bg transparent
- Hover: bg `cc-surface-hover`
- Active: bg `cc-primary-soft`, text `cc-primary`, no left border accent
- Group label: `text-label` (11px uppercase), color `cc-text-tertiary`, padding `16px 16px 8px`

### 9.6 Empty state

The "no data" moment is critical for first-time experience.

- Centered in the available area
- Icon: 48×48 Lucide, color `cc-text-tertiary`
- Title: `text-h2`, color `cc-text`
- Subtitle: `text-body`, color `cc-text-secondary`, max-width 320px
- Single primary action button below

### 9.7 Modal / Dialog

- Backdrop: `rgba(0,0,0,0.4)` (light theme), `rgba(0,0,0,0.6)` (dark)
- Content: `cc-surface`, max-width 480px (or 720px for media), `radius-md`, `cc-shadow-lg`
- Padding: `space-8` (32px)
- Title: `text-h2`
- Close button (top-right): ghost variant, X icon
- Action area (bottom-right): secondary button + primary button, gap `space-2` (8px)

### 9.8 Toast / Notification

- Top-right of viewport, stack vertically with `space-2` gap
- 320px wide, padding `space-4` (16)
- bg per variant: `cc-success-soft` / `cc-warning-soft` / `cc-danger-soft` / `cc-info-soft`
- 4px left border in solid status color
- Icon + 1-line message + optional inline action (text button)
- Auto-dismiss after 4s (success/info) / 6s (warning/danger)
- Slide in from right, fade out

### 9.9 Badge / Chip

- Padding `2px 8px`
- `radius-sm` (or `radius-full` for status dots)
- 12px text, weight 500
- Variants:
  - Neutral: bg `cc-surface-hover`, text `cc-text-secondary`
  - Primary: bg `cc-primary-soft`, text `cc-primary`
  - Success/Warning/Danger/Info: bg `*-soft`, text `*`

### 9.10 Skeleton / Loading

- Use animated gradient skeletons for content loading > 200ms
- bg gradient: `cc-surface-hover` → `cc-bg` → `cc-surface-hover`
- 1.5s loop
- For < 200ms loads, no skeleton; for > 2s loads, add a tiny "this is taking longer than expected" hint after 2s

---

## 10. Iconography

**One icon set:** [Lucide](https://lucide.dev) (already installed: `lucide-react`).

- 16×16 default, 18×18 sidebar/buttons, 20×20 toolbar, 24×24 modal/empty-state titles, 48×48 empty-state hero
- Monochrome only — color comes from text color of parent
- Replace ALL emojis (📁 📷 🖨 ↻ ✂ 📥) with Lucide equivalents (`Folder`, `Camera`, `Printer`, `RotateCw`, `Crop`, `Download`)

Why: emojis render differently per OS, can't be tinted with `currentColor`, look childish next to professional UI.

---

## 11. Density rules

Zerodha is **dense in data, spacious in actions**:

- **Lists/tables** (customers, jobs, sessions, messages): tight, 14px text, 12px row padding, fits many rows on screen.
- **Action surfaces** (Photo Tool toolbar, Settings forms, Customer Detail): generous whitespace, 24px card padding, breathing room.

The current app uses dense everywhere, which makes action surfaces feel cramped. The new system fixes this by category.

---

## 12. Motion

Almost none. Stillness > motion.

| Allowed | Disallowed |
|---|---|
| 150ms color transitions on hover | Bouncy springs |
| 200ms slide-in for modals/toasts | Hover scale-up |
| Loading spinners (necessary feedback) | Continuous gradient animations |
| 200ms skeleton fade-out → content | Page-transition wipes |

Default `transition-duration: 150ms`. Default `transition-timing: cubic-bezier(0.4, 0, 0.2, 1)`.

---

## 13. Voice / copy

- Plain language. "Print Aadhaar copies" not "Generate hardcopy output."
- Action buttons describe the action: "Print", "Save customer", "Cancel". Not "OK", "Submit".
- Errors are kind: "Couldn't load this image — try again, or pick another." Not "ERROR: bitmap creation failed".
- Empty states are inviting, not apologetic: "No customers yet" + "Customers received via WhatsApp will appear here." + CTA to add manually. Not "There is no data."
- All-caps reserved for labels and badges. Sentence case for headings.

---

## 14. CSS implementation

```css
:root {
  /* Light theme default */
  --cc-primary: #1d4ed8;
  --cc-primary-hover: #1e40af;
  --cc-primary-pressed: #1e3a8a;
  --cc-primary-soft: #eff6ff;
  --cc-primary-bg: #dbeafe;
  --cc-focus-ring: #60a5fa;

  --cc-bg: #fafafa;
  --cc-surface: #ffffff;
  --cc-surface-hover: #f5f5f5;
  --cc-surface-pressed: #ebebeb;
  --cc-border: #e8e8e8;
  --cc-border-strong: #d0d0d0;
  --cc-border-focus: #1d4ed8;

  --cc-text: #1a1a1a;
  --cc-text-secondary: #5e5e5e;
  --cc-text-tertiary: #9b9b9b;
  --cc-text-disabled: #c4c4c4;
  --cc-text-on-primary: #ffffff;

  --cc-success: #10b981;
  --cc-success-soft: #d1fae5;
  --cc-warning: #f59e0b;
  --cc-warning-soft: #fef3c7;
  --cc-danger: #dc2626;
  --cc-danger-soft: #fee2e2;
  --cc-info: #0891b2;
  --cc-info-soft: #cffafe;

  --cc-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
  --cc-shadow-md: 0 4px 8px -2px rgba(0, 0, 0, 0.06), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
  --cc-shadow-lg: 0 12px 24px -4px rgba(0, 0, 0, 0.10), 0 4px 8px -2px rgba(0, 0, 0, 0.06);

  --cc-radius-sm: 4px;
  --cc-radius-md: 8px;
  --cc-radius-lg: 12px;
}

[data-theme="dark"] {
  --cc-primary: #3b82f6;
  --cc-primary-hover: #60a5fa;
  --cc-primary-pressed: #2563eb;
  --cc-primary-soft: #1e3a8a;
  --cc-primary-bg: #1e40af;
  --cc-focus-ring: #93c5fd;

  --cc-bg: #0f172a;
  --cc-surface: #1e293b;
  --cc-surface-hover: #334155;
  --cc-surface-pressed: #475569;
  --cc-border: #334155;
  --cc-border-strong: #475569;
  --cc-border-focus: #3b82f6;

  --cc-text: #f1f5f9;
  --cc-text-secondary: #cbd5e1;
  --cc-text-tertiary: #94a3b8;
  --cc-text-disabled: #64748b;

  --cc-success: #34d399;
  --cc-success-soft: #064e3b;
  --cc-warning: #fbbf24;
  --cc-warning-soft: #78350f;
  --cc-danger: #ef4444;
  --cc-danger-soft: #7f1d1d;
  --cc-info: #22d3ee;
  --cc-info-soft: #164e63;

  --cc-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --cc-shadow-md: 0 4px 8px -2px rgba(0, 0, 0, 0.5);
  --cc-shadow-lg: 0 12px 24px -4px rgba(0, 0, 0, 0.6);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* Same overrides as [data-theme="dark"] */
  }
}
```

## 15. Tailwind config (extension, additive only — does not remove existing tokens)

```js
// tailwind.config.js — extend block
extend: {
  colors: {
    cc: {
      bg: 'var(--cc-bg)',
      surface: 'var(--cc-surface)',
      'surface-hover': 'var(--cc-surface-hover)',
      'surface-pressed': 'var(--cc-surface-pressed)',
      border: 'var(--cc-border)',
      'border-strong': 'var(--cc-border-strong)',
      text: 'var(--cc-text)',
      'text-secondary': 'var(--cc-text-secondary)',
      'text-tertiary': 'var(--cc-text-tertiary)',
      'text-disabled': 'var(--cc-text-disabled)',
      primary: {
        DEFAULT: 'var(--cc-primary)',
        hover: 'var(--cc-primary-hover)',
        pressed: 'var(--cc-primary-pressed)',
        soft: 'var(--cc-primary-soft)',
        bg: 'var(--cc-primary-bg)',
      },
      success: { DEFAULT: 'var(--cc-success)', soft: 'var(--cc-success-soft)' },
      warning: { DEFAULT: 'var(--cc-warning)', soft: 'var(--cc-warning-soft)' },
      danger:  { DEFAULT: 'var(--cc-danger)',  soft: 'var(--cc-danger-soft)' },
      info:    { DEFAULT: 'var(--cc-info)',    soft: 'var(--cc-info-soft)' },
    },
  },
  fontSize: {
    'cc-display': ['32px', { lineHeight: '1.2', fontWeight: '600' }],
    'cc-h1':      ['24px', { lineHeight: '1.3', fontWeight: '600' }],
    'cc-h2':      ['18px', { lineHeight: '1.3', fontWeight: '600' }],
    'cc-h3':      ['15px', { lineHeight: '1.4', fontWeight: '600' }],
    'cc-body':    ['14px', { lineHeight: '1.5', fontWeight: '400' }],
    'cc-body-strong': ['14px', { lineHeight: '1.5', fontWeight: '500' }],
    'cc-small':   ['13px', { lineHeight: '1.5', fontWeight: '400' }],
    'cc-label':   ['11px', { lineHeight: '1.4', fontWeight: '500', letterSpacing: '0.04em' }],
    'cc-mono':    ['13px', { lineHeight: '1.5', fontWeight: '400', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }],
  },
  borderRadius: {
    'cc-sm': '4px',
    'cc-md': '8px',
    'cc-lg': '12px',
  },
  boxShadow: {
    'cc-sm': 'var(--cc-shadow-sm)',
    'cc-md': 'var(--cc-shadow-md)',
    'cc-lg': 'var(--cc-shadow-lg)',
  },
}
```

The `cc-` prefix avoids collision with Tailwind defaults and existing legacy tokens (`bg-background`, `text-foreground`, `.btn-primary`) so old screens keep working until migrated.

---

## 16. Component build priority

Order matters: foundational components first, composite components last. Each component:
- Lives in `frontend/src/shared/ui/`
- Uses ONLY `cc-*` tokens
- Has variant + size + state defined per spec
- Is keyboard-accessible by default
- Has a JSDoc comment with usage example

**Tier 1 (foundational, build first):**

1. **Button** — variants × sizes × states, with `loading` state and icon support. Most-touched component.
2. **Input** — text, with label, helper text, error state. Used in every form.
3. **Card** — clickable + non-clickable variants. Container for content blocks.
4. **EmptyState** — icon + title + subtitle + optional CTA. Used in every list screen.

**Tier 2 (compositional):**

5. **Sidebar / NavItem** — page navigation chrome. Defines whole-app feel.
6. **PageHeader** — title + breadcrumbs + actions. Standardizes page tops.
7. **Modal / Dialog** — focus trap, Escape to close, backdrop click to close.
8. **Toast** — already exists in `shared/Toasts.tsx` but not styled correctly. Refactor into ui/.

**Tier 3 (data-heavy):**

9. **Table / DataList** — sortable columns, selectable rows, pagination, empty state slot.
10. **Badge / Chip** — status indicators across the app.
11. **Skeleton** — content-loading placeholders.
12. **Avatar** — user/customer initials, optional image.

**Tier 4 (specialized):**

13. **Dropdown / Menu** — already partly via Radix; restyle.
14. **Tabs** — for settings, admin views.
15. **Tooltip** — for icon-only buttons.

---

## 17. Migration strategy

We don't redo everything at once. The order:

1. ✅ **Lock this doc + the CSS variables.** Done in commit 2911030.
2. **Add new tokens and CSS** (additive — old tokens stay alive).
3. **Build Tier 1 components** (`Button`, `Input`, `Card`, `EmptyState`) in `shared/ui/`.
4. **Migrate one screen at a time.** Order:
   1. **Login** (smallest, public-facing, sets first impression)
   2. **Layout / Sidebar** (sets whole-app frame — affects all screens)
   3. **WhatsApp** (most-used)
   4. **Photo Tool** (recent code, our flagship)
   5. **Customer Detail**
   6. **Dashboard**
   7. **Customers list, Jobs, Settings, Admin**
5. **Old screens keep working** during migration. Mixing old/new in same screen forbidden.
6. **After all migrated**, remove old CSS variables (`--background`, `--foreground`, etc.) and legacy classes (`.sidebar-item`, `.btn-primary`, etc.).

---

## 18. What this fixes (success criteria)

| Current pain | Predicted fix |
|---|---|
| "Looks like a developer tool" | Light theme + Inter + restrained color = professional SaaS |
| "Cluttered" | Whitespace doubled; hierarchy via type; fewer visible elements |
| "Hard to find primary action" | One primary button per screen; brand blue; visually loud |
| "Inconsistent" | One icon set, one button family, one spacing scale |
| "Dark theme tiring" | Light default; dark mode opt-in for night |
| "No personality" | Calm professional. Personality is "no personality." |
| "Eye fatigue" | Light bg + 4.5:1 contrast minimum + Inter rendering |

If these don't visibly improve, this design system has failed and we'll re-spec.

---

## 19. Sign-off

Same procedure as `ARCHITECTURE.md`. Approved → contract. Changes require explicit doc revision, not silent code drift.

**v1.2 — 2026-05-26 — added §20 Responsive Design (mobile/tablet/desktop spec).**
**v1.1 — 2026-05-26 — addresses feedback on color depth, focus states, label token, sidebar width, dark mode parity.**
**v1.0 — 2026-05-25 — initial Zerodha-inspired light theme.**

---

## 20. Responsive design

CyberControl is **desktop-first in design** (operators sit at counters with monitors), but **must work on tablet and phone**. Cafe owners check dashboards from phones; operators use tablets for chat-only workflows; admins review data while traveling.

The rule: **every screen works at every breakpoint.** No "use desktop please" walls. Some screens (Photo Tool) degrade gracefully on small screens; others (WhatsApp, Customers, Dashboard) work equally well on all.

### 20.1 Breakpoints

Use Tailwind defaults. Mobile-first base; progressively enhance.

| Token | min px | Device class | Typical width |
|---|---|---|---|
| (base) | 0 | Phone portrait | 360–414px |
| `sm` | 640 | Phone landscape, small tablet | 640–767 |
| `md` | 768 | Tablet portrait | 768–1023 |
| `lg` | 1024 | Tablet landscape, small laptop | 1024–1279 |
| `xl` | 1280 | Desktop | 1280–1535 |
| `2xl` | 1536 | Wide desktop, monitors | 1536+ |

### 20.2 Layout patterns

**Sidebar:**
- `< md` (mobile, < 768px): hidden by default. Hamburger button at top-left opens it as a drawer overlay with backdrop. Tap outside or swipe-left to close. Auto-close after navigation.
- `md` to `lg-1` (tablet): collapsed to **icon-only rail** (60px wide). Labels appear on hover or expand-toggle. Saves space without losing navigation.
- `lg+` (desktop): full 240px sidebar with icon + label.

**Page padding:**
- Mobile: `space-4` (16px) horizontal, `space-3` (12px) vertical.
- Tablet (`md`): `space-6` (24px) horizontal.
- Desktop (`lg+`): `space-8` (32px) horizontal.

**Multi-column grids** (template tiles, customer cards, drive picker, photo album):
- Base: 1 column
- `sm:` 2 columns
- `lg:` 3 columns
- `xl:` 4 columns

**Tables → Cards transformation:**
On mobile, traditional tables don't fit. Each row becomes a vertical card with label-value pairs.
- Base: card layout. Each row: `<div>` with stacked `<dt>`/`<dd>` style.
- `md+`: traditional table.
Implementation: same data; conditional render or CSS transformation via media queries.

### 20.3 Touch targets

- Touch devices (phone, tablet): minimum **44×44px** (WCAG 2.5.5).
- Mouse devices (desktop): minimum **36×36px**.

Use responsive sizing: `h-12 md:h-10` (48px touch, 40px desktop) for primary buttons.

Spacing between adjacent touch targets: minimum 8px to prevent fat-finger errors.

### 20.4 Typography on mobile

Base font sizes adjust slightly for readability without zoom:

| Token | Mobile | Desktop |
|---|---|---|
| `text-cc-body` | 15px | 14px |
| `text-cc-small` | 14px | 13px |
| `text-cc-label` | 11px | 11px (unchanged) |
| Headings (`h1`/`h2`/`h3`) | unchanged | unchanged |

Inputs: minimum 16px font-size on mobile (prevents iOS Safari auto-zoom on focus).

### 20.5 Component-specific responsive specs

**Modals:**
- `< md`: full-screen bottom sheet (slides up from bottom, full viewport height).
- `md+`: centered card with backdrop (as spec'd in §9.7).

**Toolbars** (page headers, Photo Tool header):
- `< md`: condense to icon-only buttons; overflow into a "..." menu.
- `md`: text + icon for primary actions; icon-only for secondary.
- `lg+`: full labels and icons.

**Forms:**
- `< md`: single column, fields stacked, full-width.
- `md+`: 2-column where it makes sense (e.g., first-name + last-name).

**Drive picker, photo grid, template tiles:**
- Follow the multi-column grid rule above.

**WhatsApp page:**
- `< md`: chat list OR conversation visible (full-screen). Tapping a chat replaces the list with the conversation. Back button to return.
- `md+`: split view (chat list 320px + conversation flexible).

**Toast / notifications:**
- `< sm`: top of viewport, full-width minus 16px margin.
- `sm+`: top-right, 320px wide as spec'd.

**Drawers / popovers:**
- `< md`: bottom-sheet style (slides up).
- `md+`: anchored popover.

### 20.6 Photo Tool — graceful degradation

Photo Tool needs canvas real estate. We don't block mobile, but we honestly degrade:

- `< md` (mobile): canvas takes most of the viewport. Template sidebar collapses into a bottom-sheet picker. Tools (rotate, B&W, crop, etc.) become a horizontal scroll bar above the canvas. **All features work**, just bigger touch targets and reorganized chrome.
  - On first visit on a small screen, show a tiny dismissable banner: "For complex layouts, switch to desktop." Don't block use.
- `md` (tablet): sidebar collapses to bottom drawer; canvas + drawer compose. All features available with comfortable touch.
- `lg+` (desktop): full experience as designed in current code.

Print works at all sizes (it hits the system print dialog regardless).

### 20.7 Testing requirements

Every screen must work at these viewports. Test in Chrome DevTools device emulation before considering a screen "done."

| Test viewport | Why |
|---|---|
| 360×800 | Common Android phone |
| 414×896 | Larger phone (iPhone Pro Max) |
| 768×1024 | iPad portrait — typical operator tablet |
| 1024×768 | iPad landscape, small laptop |
| 1280×800 | Common laptop / Chromebook |
| 1920×1080 | Standard desktop monitor |

A screen "passes" responsive if:
- No horizontal scroll at any viewport.
- All text legible without zoom.
- All interactive elements reachable and tappable.
- Primary action visible above the fold (mobile).
- No content cut off or hidden behind other elements.

### 20.8 Implementation guidance

- **Always mobile-first.** Write base styles for `< sm`, then layer `sm:`, `md:`, `lg:` modifiers.
- **Don't write separate components per breakpoint.** One `<Sidebar>` that adapts via Tailwind classes, not `<MobileSidebar>` and `<DesktopSidebar>`.
- **Never use `min-width: 1024px` to block features.** If a feature genuinely can't work on mobile, hide it gracefully and explain in plain language.
- **Test with the keyboard hidden on mobile** — viewport shrinks when keyboard opens.
- **Use `dvh` (dynamic viewport height)**, not `100vh`, to handle mobile browser address bars.
- **Drag/drop fallbacks:** mobile has no drag-drop for files. Replace with explicit "Choose Image" button (we already have this).

### 20.9 Anti-patterns

- ❌ Hide critical features on mobile because "they're hard to fit." Find a layout that works.
- ❌ Use `min-width` media queries to block mobile users.
- ❌ Build separate `mobile-*.tsx` files. Single component, responsive via Tailwind.
- ❌ Touch targets smaller than 44×44 on touch devices.
- ❌ Sidebar drawer that doesn't auto-close after a nav action on mobile.
- ❌ Modal that's centered on mobile (small modals get lost; use bottom-sheet).
- ❌ Tables without mobile fallback (will horizontal-scroll badly).
