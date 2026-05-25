# CyberControl Design System

**Status:** Draft v1. Zerodha-inspired. Calm, dense, professional, low-fatigue.
**Goal:** A unified visual language that works for an operator running CyberControl 8 hours/day in a cybercafe with bright fluorescent lights.

---

## 1. Design philosophy

**Calm > exciting.** Operators don't want a Cred-style party screen. They want a Zerodha-style instrument panel. The app fades into the background; the customer's data and tasks are the foreground.

**Whitespace is content.** The current app is cluttered because every pixel is filled. Zerodha shows fewer things, larger, with breathing room. We do the same.

**Type carries the hierarchy.** Most "design" is just font sizes and weights done right. Borders and shadows are minimal.

**One color does the work.** Primary action color is the brand. Everything else is gray. Color shouldn't fight for attention.

**Light theme.** Cybercafes have bright lighting. Dark UIs cause eye fatigue under fluorescent light. White-background, dark-text. (Optional dark mode later.)

---

## 2. Color palette

### Brand
- **Primary:** `#1a73e8` (clean blue — Zerodha-style, but blue not orange because finance vs utility)
- **Primary hover:** `#1557b0`
- **Primary light:** `#e8f0fe` (background tint for primary-related UI)

### Neutrals (the workhorses — used 90% of the time)
- **Page background:** `#fafafa` (subtle off-white, easier on eyes than pure white)
- **Card / surface:** `#ffffff`
- **Border (subtle):** `#e8e8e8`
- **Border (strong):** `#d0d0d0`
- **Text primary:** `#1a1a1a`
- **Text secondary:** `#5e5e5e`
- **Text tertiary / hints:** `#9b9b9b`
- **Disabled:** `#c4c4c4`

### Status (use sparingly)
- **Success:** `#10b981` (green — confirmations, "ready", saved)
- **Warning:** `#f59e0b` (amber — needs attention, low confidence)
- **Danger:** `#ef4444` (red — destructive only, never decorative)
- **Info:** `#0891b2` (teal — informational, neutral)

### What to NEVER do
- Don't use 6 different shades of gray. Pick from the 4 above.
- Don't use the brand blue for non-primary things (no blue borders, no blue captions).
- Don't use dark backgrounds for primary surfaces. Reserved for hover states or special panels only.
- Don't use gradients except in very rare cases (avatars, hero illustrations).

---

## 3. Typography

### Font family
**Inter** as primary (clean, neutral, excellent for data + UI). Fallback: `system-ui, -apple-system, sans-serif`.

For monospace (codes, IDs, file hashes): **JetBrains Mono** or `ui-monospace`.

### Scale
| Token | Size | Weight | Use |
|---|---|---|---|
| `display` | 32px | 600 | Page hero, dashboard total |
| `h1` | 24px | 600 | Page title |
| `h2` | 18px | 600 | Section title |
| `h3` | 15px | 600 | Card / panel title |
| `body` | 14px | 400 | Default text, table rows |
| `small` | 13px | 400 | Captions, secondary info |
| `tiny` | 12px | 500 | Labels, meta info, badges |

Line height: 1.5 for body, 1.3 for headings.

### Rules
- One font weight per usage (400 for body, 600 for headings). No 500, no 700.
- No italic except for genuine emphasis (rare).
- No all-caps except in tiny (12px) labels and badges.

---

## 4. Spacing

8px base scale: `4, 8, 12, 16, 20, 24, 32, 48, 64`. Nothing in between.

| Use | Spacing |
|---|---|
| Inline padding (button) | 12px x 8px |
| Card padding | 24px |
| Section gap | 32px |
| Page padding | 24px (mobile) / 32px (desktop) |
| Gap between cards | 16px |
| Gap between form fields | 16px |
| Gap between paragraphs | 12px |

---

## 5. Components

### Buttons

**Primary** (one per screen, the obvious next action):
- Background: `#1a73e8`, text white
- Padding: `10px 16px`
- Border-radius: `4px`
- Font: 14px, weight 500
- No shadow
- Hover: `#1557b0`, no transform / no scale

**Secondary** (next-to-primary, less important):
- Background: white, border `1px solid #d0d0d0`, text `#1a1a1a`
- Same size as primary
- Hover: `#fafafa` background

**Ghost / tertiary** (sidebar, link-like actions):
- No background, no border, text `#1a1a1a`
- Hover: `#f5f5f5` background

**Danger** (delete, only in confirmation contexts):
- Background `#ef4444`, text white
- Same shape as primary

**Disabled state**: opacity 0.5, no hover effect, cursor `not-allowed`.

**Anti-rules:**
- No glow, no gradient, no scale-on-hover, no rounded-full unless it's a chip.
- One primary button per screen, max.
- Icon-only buttons get tooltips, never just emoji.

### Cards / panels
- Background: white
- Border: `1px solid #e8e8e8`
- Border-radius: `8px`
- Padding: `24px`
- No drop-shadow (or very subtle: `0 1px 2px rgba(0,0,0,0.04)`)

### Inputs
- Border: `1px solid #d0d0d0`
- Border-radius: `4px`
- Padding: `10px 12px`
- Focus: border `1px solid #1a73e8`, no outline-glow
- Disabled: `#fafafa` bg, `#c4c4c4` text

### Tables
- Header: `#fafafa` background, 13px, weight 500, text-secondary color
- Row: 14px body, `#1a1a1a`
- Border between rows: `1px solid #f0f0f0` (very subtle)
- Hover row: `#fafafa`
- Selected row: `#e8f0fe`
- No zebra striping (looks cluttered).

### Navigation (sidebar)
- Background: white
- Width: 220px (was 192–208px — give it room)
- Items: 36px tall, `12px 16px` padding
- Selected: `#e8f0fe` background, `#1a73e8` text, no left border
- Hover: `#f5f5f5` background
- Icons: 16x16, monochrome from a single icon set (Lucide recommended)
- Group items by frequency (most-used at top), small dividers

### Empty states
**This is where Zerodha really wins.** When there's no data:
- Center of viewport
- A small monochrome illustration (or just a single emoji at 48px size)
- One-line h2: "No customers yet"
- One-line subtext: "Customers added via WhatsApp will appear here."
- One primary CTA: "Add a customer manually"

Not a tiny gray "No data" in the corner.

### Modals
- Backdrop: `rgba(0,0,0,0.4)` (not the current 85% — too dark)
- Content: white card, 480px max-width
- Padding: 32px
- Title: h2
- Close button: top-right, ghost style with X icon
- Buttons: aligned right, secondary then primary

### Toasts / notifications
- Solid color (success green, danger red, info teal)
- Top-right of viewport
- 320px wide
- Slide in from right, auto-dismiss after 4s
- Icon + one-line message + optional action

---

## 6. Iconography

**One icon set:** [Lucide](https://lucide.dev/) (or Heroicons). 16px or 20px. Monochrome.

Replace ALL emojis (📁 📷 🖨 ↻ ✂ 📥) with Lucide equivalents (folder, camera, printer, rotate-cw, scissors, download).

Why: emojis render differently per OS, can't be color-tinted, look childish next to professional UI.

---

## 7. Density

Zerodha is dense in **data tables** but spacious in **action surfaces**. We follow the same rule:

- **Tables / lists** (customers, jobs, sessions, messages): tight, 14px text, 8–12px padding, fits many rows.
- **Action surfaces** (Photo Tool, Settings forms, Customer detail): generous whitespace, larger text, room to breathe.

The current app uses dense layouts for everything, which makes action surfaces feel cramped.

---

## 8. Motion

Almost none. Zerodha is still. CyberControl should be still.

Allowed:
- 150ms color transitions on hover
- 200ms slide-in for modals/toasts
- Loading spinners (necessary feedback)

Disallowed:
- Bouncy animations
- Hover scale-up
- Continuous gradient animations
- Anything that adds cognitive load

---

## 9. Voice / copy

- Plain language. "Print Aadhaar copies" not "Generate hardcopy output."
- Hindi/Hinglish OK in prompts where it fits the operator audience: "Customer ke liye print kar do" — *only if the user wants this.* Default: clear English.
- Errors are kind: "Couldn't load this image — try again, or pick another." Not "ERROR: bitmap creation failed".
- Action buttons describe the action: "Print" (not "Submit"), "Save customer" (not "OK").

---

## 10. Implementation as code

When we apply this:

```css
/* CSS variables in :root */
:root {
  --color-primary: #1a73e8;
  --color-primary-hover: #1557b0;
  --color-primary-light: #e8f0fe;
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-border: #e8e8e8;
  --color-border-strong: #d0d0d0;
  --color-text: #1a1a1a;
  --color-text-secondary: #5e5e5e;
  --color-text-tertiary: #9b9b9b;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-info: #0891b2;
  --radius-sm: 4px;
  --radius-md: 8px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}
```

Tailwind config maps to these via `theme.extend.colors` / `theme.extend.spacing`.

---

## 11. Migration strategy

We don't redo everything at once. We:

1. **Lock this doc + the CSS variables.** Everyone uses them going forward.
2. **Build a shared `ui/` folder** with: `Button`, `Card`, `Input`, `Modal`, `Table`, `EmptyState`, `Toast`, `Sidebar` — primitives that match this spec.
3. **Migrate one screen at a time.** Start with the most-used: WhatsApp (entry point), then Photo Tool, then Customer Detail, then Dashboard, then Admin, then Settings.
4. **Old screens keep working** during migration. We don't break things to make them prettier.
5. **No mixing of old and new on same screen.** A screen is either fully migrated or untouched.

---

## 12. What this fixes (predicted)

| Current pain | What changes |
|---|---|
| "Looks like a developer tool" | Light theme + Inter + restrained color = professional SaaS |
| "Cluttered" | Whitespace doubled, hierarchy via type, fewer visible elements |
| "Hard to find primary action" | One primary button per screen, brand blue, visually loud |
| "Inconsistent" | One icon set, one button style, one spacing scale |
| "Dark theme tiring" | Light theme reduces eye fatigue under cybercafe lighting |
| "No personality" | Calm, professional, calm — a personality is "no personality" |

---

## Sign-off

Read this. If anything feels wrong, push back BEFORE we start building components. Once approved, this becomes the contract — same way `ARCHITECTURE.md` did.

Approved by: ____________
Date: ____________
