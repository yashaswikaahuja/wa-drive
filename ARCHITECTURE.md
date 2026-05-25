# CyberControl Architecture Doctrine

**Status:** Active.
**Last reviewed:** 2026-05-25.
**Next review trigger:** when any of the conditions in §10 changes.

This document is the architectural contract for CyberControl.
It is binding for every PR, every new feature, and every operational decision.

It is **not** a description of the system today.
It is the **rules** that govern how the system is allowed to evolve.

If you are about to add code that conflicts with anything in this document,
the correct path is not to override the rule.
The correct path is to either:

1. Find a way that respects the doctrine, or
2. Open a PR that explicitly amends this document, with reasoning,
   and get sign-off before merging the feature.

Silent violations are the single biggest threat to this system's stability.

---

## 1. Why this document exists

The infrastructure CyberControl runs on is small and shared.
Every "small" piece of CPU work added to the wrong box compounds:

- It depletes burst CPU credits, throttling the instance.
- It competes with PostgreSQL for memory, slowing every query.
- It competes with WhatsApp's heartbeats, causing operator-visible disconnects.
- It introduces failure modes that are invisible until production load reveals them.

The natural pressure on any system is **architectural erosion** —
shortcuts, convenience endpoints, "just one tiny exception" features that
each look harmless and collectively destabilize the platform.

This document exists so that future contributors (including future maintainers
of this project who weren't here for the 2026 design discussions) can
read the rules and the reasoning and decide whether their proposed change
is consistent with the system's design.

The reasoning matters as much as the rules. If the reasoning becomes obsolete,
the rules should be revisited. If the reasoning still holds, the rules hold.

---

## 2. Current infrastructure footprint (the constraint)

As of 2026-05-25:

- **GCP #1** (`api.cybercontrol.fun`, hub + extension-service + Postgres):
  e2-micro-class instance, ~1 GB RAM, burstable 2 vCPU.
  Currently running:
    - PostgreSQL (~200 MB)
    - hub Node service (`cybercontrol-hub`, port 3000)
    - extension-service Node (`extension-service`, port 3300)
    - nginx (`:443` → port routing)
    - Cloudflare tunnel
    - pm2 daemon
  Realistic free RAM at idle: ~400 MB.
  Sustained CPU budget under burst credits: ~12% of one core.

- **GCP #2** (`34.100.147.20`, WhatsApp services):
  e2-micro-class instance, ~1 GB RAM.
  Currently running:
    - whatsapp-service (Baileys, port 3100)
    - whatsapp-resolver (wwebjs + Chromium, port 3200)
  Memory pressure already ~70% baseline due to Chromium.

- **Vercel:** frontend hosting only. No compute runs there.

- **Browser (operator's Chrome):** the system's actual compute layer.
  Cybercafe operators run desktop Chrome on Windows i3/i5/Celeron PCs.
  These machines collectively have orders of magnitude more compute
  than the GCP instances. They are paid for by the cybercafe owner, not us.

This means the architecture has to treat **server compute as scarce**
and **browser compute as abundant**.

That single inversion drives every rule below.

---

## 3. Core Doctrine

These are the rules. Each is followed by its reasoning.

### 3.1 The backend is a filing cabinet, not a workshop.

**Rule:** GCP #1 stores, retrieves, authenticates, streams, and coordinates.
It does not transform binary content of any kind.

**Reasoning:** Image, video, and PDF processing all involve allocating
buffers proportional to file size, then doing CPU-intensive work on shared
cores. On e2-micro, even a single concurrent rasterization can throttle
the box and slow every other operator. We have already proven we can build
a fast, useful product without server-side rendering. There is no scenario
where adding it gives us more than it costs.

### 3.2 The browser is the compute layer.

**Rule:** Pixels, layouts, exports, and prints are produced in the operator's
browser, not on a server.

**Reasoning:** Modern desktop Chrome on a 2018-era cybercafe PC outperforms
our entire GCP #1 instance for image and PDF work. Decentralizing rendering
to browsers means our scaling cost for adding 100 more cybercafes is zero
in compute. The only thing that grows is metadata in Postgres, which is
the cheapest scaling problem a system can have.

### 3.3 One workload, one compute boundary.

**Rule:** When a new workload category is needed (messaging, ML, OCR,
heavy I/O), it gets its own VM or service. It does not get added as a new
process on an existing box.

**Reasoning:** WhatsApp is on GCP #2 because Baileys + Chromium would have
killed GCP #1 if co-located. That instinct was correct. Future workloads
that violate the doctrine of GCP #1 (e.g., AI inference, OCR, video) must
follow the same pattern: spin up a new e2-micro-class box, isolate the
workload, document it in §4. Adding a third or fourth box at $6/month each
is cheaper than letting one workload destabilize all the others.

### 3.4 Rendering is deterministic.

**Rule:** Same template + same source image + same operator settings must
produce a byte-identical output every time.

**Reasoning:** Determinism eliminates the need to store generated files.
Reprints become "load the inputs and re-render" instead of "find the cached
output." Debugging becomes "compare expected output to actual." Customer
trust increases because today's print and tomorrow's print look the same.
This requires deliberate engineering: PDF metadata timestamps must be
fixed, font subsetting locked, image hashes verified. It is not free, but
it pays for itself in operations.

### 3.5 Photo Tool (and similar utilities) are request/response, not realtime.

**Rule:** Print/photo workflows do not subscribe to WebSockets, do not
emit socket events, do not depend on socket.io.

**Reasoning:** Realtime systems and high-frequency request/response systems
have different failure modes and different scaling characteristics. Mixing
them creates dependencies that bite under load — a buggy print loop
shouldn't be able to disconnect a working WhatsApp session. WhatsApp uses
sockets because it must. Photo Tool doesn't, so it doesn't.

### 3.6 Tabs must be killable without consequence.

**Rule:** Closing a Photo Tool tab mid-job, losing power, or crashing
Chrome leaves no state on the server that requires reconciliation.

**Reasoning:** Cybercafe reality includes power cuts, frozen Windows, and
operators who close tabs without thinking. Any server-side state that
assumes the browser will report back ("processing", "pending", "in-progress")
will accumulate orphan rows and require cleanup jobs. We avoid this by
having no such state. Print logs are append-only; if the browser never
reaches the "log" step, no row exists. That's acceptable.

### 3.7 Templates are versioned by content hash.

**Rule:** A template's effective ID includes a hash of its config JSON.
Updating the template produces a new ID. Old print log rows reference the
old ID forever.

**Reasoning:** When the Aadhaar template's positioning is "fixed" in
6 months, an audit of "why does this customer's print look different from
last month's" becomes trivially answerable: their old print used template
`aadhaar-2c@v1`, their new one uses `aadhaar-2c@v2`. Without versioning,
this becomes archaeology.

### 3.8 Third parties take the CPU hit, not us.

**Rule:** When a feature requires CPU-heavy compute we cannot do in the
browser (e.g., background removal, OCR), we use a 3rd-party API and pass
the per-call cost through to the operator. We do not host the model.

**Reasoning:** Hosting a single ML model on GCP #1 would consume more RAM
than the rest of the application combined. Hosting it on a separate VM is
fine in principle, but the per-call cost is dominated by the box's idle
cost when no one is using the feature. A 3rd-party API charges only when
used, scales infinitely, and isolates the failure modes from our
infrastructure.

---

## 4. Compute boundaries

### 4.1 GCP #1 — the filing cabinet

**Allowed:**
- Authentication (`/api/auth/*`)
- Authorization (JWT verification, workspace scoping)
- Metadata CRUD (profiles, mappings, sessions, corrections, jobs, templates, print-log)
- Streaming relays (Drive download → response, not buffered)
- WebSocket coordination (socket.io for chat, QR delivery, realtime updates)
- Workspace state (`workspace_secrets`, configs)
- Database queries (PostgreSQL, single-instance, on-box)
- Service-to-service forwarding (hub ↔ extension-service)

**Forbidden:**
- Image decoding, encoding, or transformation of any kind
- PDF generation
- Video processing
- Headless browser automation (Puppeteer, Playwright)
- OCR, ML inference, AI model hosting
- Background job queues, async processing pipelines
- Long-running async work outside HTTP request lifecycle
- File system writes for user content (logs to disk are OK; user uploads to disk are not)
- Buffering whole files into memory before responding (must stream)

### 4.2 GCP #2 — the WhatsApp box

**Allowed:**
- Baileys session management
- wwebjs resolver (LID → phone, profile pic, saved name)
- Chromium for resolver only
- Forwarding messages and media to GCP #1
- Local session persistence on disk (Baileys requires this)
- Health endpoints

**Forbidden:**
- Any non-WhatsApp workload
- Image processing (forward bytes, do not decode)
- API endpoints unrelated to messaging
- Subscribing to GCP #1's database (must communicate via HTTP only)

### 4.3 Browser — the compute layer

**Allowed:**
- All pixel work: composition, filters, rotation, cropping, rasterization
- PDF generation (pdf-lib in browser)
- Print dispatch (iframe + window.print)
- IndexedDB caching of downloaded blobs (LRU, capped)
- OffscreenCanvas + Web Workers for heavy work off the main thread
- Service Worker for offline tolerance
- Local in-memory state for the active session

**Forbidden:**
- Storing PII (Aadhaar numbers, full document images) in localStorage or IndexedDB
  beyond the active session — when the operator closes the tab, sensitive
  blobs are flushed
- Long-lived references that prevent garbage collection (every Object URL
  paired with revoke; every Fabric canvas paired with dispose; history
  stacks capped)
- Direct calls to GCP #2 — all WhatsApp data flows through GCP #1
- Direct calls to Google Drive APIs from the browser — auth tokens stay
  server-side

### 4.4 Future boundaries — how to add one

When a workload genuinely cannot run in the browser AND cannot use a 3rd-party
API, the procedure is:

1. Open a PR that amends §4 of this document with a new subsection.
2. Justify why neither the browser nor a 3rd party is acceptable.
3. Specify the new compute boundary (separate VM, Cloud Run container, etc.).
4. Specify the resource ceiling (RAM, CPU, restart policy).
5. Specify the failure isolation guarantee (what happens when this box dies,
   and which parts of the system are unaffected).
6. Get the PR reviewed and merged before any implementation.

Skipping this procedure is the single behavior most likely to cause
production instability. Don't skip it.

---

## 5. Forbidden backend dependencies

These packages must not appear in `backend/package.json` or
`extension-service/package.json`. If a future feature requires one,
follow §4.4.

| Package | Why forbidden | What to do instead |
|---|---|---|
| `sharp` | Decodes/encodes images; allocates large buffers; CPU-heavy | Browser uses native Canvas 2D |
| `jimp` | Same as sharp, slower | Same |
| `gm` / `imagemagick` | Spawns subprocesses, hard to bound resource usage | Same |
| `canvas` (node-canvas) | Server-side rendering via Cairo; large native binary | Use `OffscreenCanvas` in the browser |
| `puppeteer` / `playwright` / `puppeteer-core` | Bundles Chromium (~300 MB binary, ~500 MB RAM idle) | Browser does its own automation; or remote 3rd-party headless service |
| `pdf-lib` (server) | Allowed in browser only; on server it's a CPU-allocation bomb during PDFs | Generate in browser |
| `pdfkit` | Server-side PDF rendering | Same |
| `tesseract.js` (server) | OCR is CPU-heavy ML | 3rd-party API (Google Vision, AWS Textract) or browser-side if small |
| `ffmpeg-static` / `fluent-ffmpeg` | Video processing on shared CPU is suicide | Defer the feature or use 3rd-party |
| `@tensorflow/tfjs-node` / `onnxruntime` | ML inference on the server | 3rd-party inference API |
| `node-poppler` / `pdf2pic` / `pdf-image` | PDF rasterization via native deps | Browser-side preview only |

If you find yourself wanting one of these, the right question is:
"Why am I trying to do pixels on the server?" Re-read §3.

---

## 6. Decision procedure for new features

Before adding any feature that touches binary content (images, PDFs,
video, audio), apply these questions in order:

1. **Can the browser do this?**
   If yes, the browser must do it. End of decision.

2. **If not, can a 3rd-party API do this with cost passed to the operator?**
   If yes, prefer that. We don't host the workload.

3. **If not, is this a new compute boundary, or does it fit in an existing one?**
   If it requires a new compute boundary, follow §4.4.
   If it fits in an existing boundary, prove (with a written capacity argument)
   that it does not compete with the current load on that boundary.

4. **Only after 1–3 fail does GCP #1 take the work.**
   And only with explicit approval, documented capacity headroom, and
   monitoring in place.

Skipping a step is the failure mode this entire document is designed to
prevent.

---

## 7. Drift metrics

The doctrine is intact when these metrics hold. If any drifts, something
has been added that violates §3 or §4. Investigate before assuming it's
"just normal load."

Checked weekly (or via automated alerts):

| Metric | Target | Alarm |
|---|---|---|
| GCP #1 sustained CPU (24h avg) | under 15% | over 25% |
| GCP #1 free RAM | over 250 MB | under 150 MB |
| Postgres p95 query time | under 50 ms | over 200 ms |
| WhatsApp socket disconnect rate | under 0.1% per hour | over 1% per hour |
| Hub HTTP p95 latency (excluding Drive download) | under 200 ms | over 500 ms |
| Disk free on GCP #1 | over 30% | under 15% |

The metrics are the smoke alarm. They don't tell you what's wrong, but
they tell you when to look.

---

## 8. Known trade-offs (what we explicitly chose not to support)

By committing to browser-side rendering, we have rejected the following
use cases. If any becomes a hard requirement, we re-open the doctrine.

- **Headless / API-driven printing** by 3rd-party software. CyberControl
  cannot expose `POST /api/photo/render` for external clients to drive.
  External clients render in their own browser (or their own server) and
  send us the resulting PDF.

- **Email-to-print integrations.** No "send an Aadhaar to this email and
  it'll print." That requires server-side rendering.

- **Mobile/tablet operator experience parity.** Phone Chrome handles 300 DPI
  rasterization more slowly than desktop Chrome. We are explicitly
  desktop-first. Tablets work but are not optimized.

- **Server-side audit trails of rendered output.** A regulator demanding
  "show me the actual bytes that were printed" cannot be satisfied; we
  only have metadata. If this becomes a legal requirement, the doctrine
  changes — but we re-open it deliberately, not as a side effect.

- **Backend caching of rendered output.** Even though caching could speed
  up reprints, it would consume disk and RAM proportional to usage, and
  introduce a quota/cleanup problem. We re-render instead, because re-render
  is free (browser-side).

- **Cross-device session sync of in-progress jobs.** Operator A starts a
  job on PC 1, finishes it on PC 2. Not supported. The job lives in the
  browser; closing the browser ends the job.

These are real losses. They are accepted because the alternative
(server-side compute) is worse for the system's stability.

---

## 9. Anti-patterns we have already seen

These patterns have appeared (or been considered) and rejected.
They are listed here so future contributors don't re-discover them
under pressure and decide they're acceptable "just this once."

### 9.1 The "tiny exception" temptation

> "It's just one small thumbnail endpoint. It's barely any CPU."

**Why it fails:** Once one rendering endpoint exists, the second one is
"reasonable because we already have one." The third one is "consistent
with the pattern." Within months, GCP #1 is doing rasterization at scale.
The right answer is: thumbnails are served by the browser (it has the
image bytes anyway) or by Drive's free thumbnail CDN.

### 9.2 The "for analytics" creep

> "We need to render previews server-side so the dashboard can show them
> at a glance."

**Why it fails:** Dashboards are also browsers. They can render their own
previews from cached blobs. The fact that "the dashboard needs it" is not
a license to violate §3.1.

### 9.3 The "Puppeteer is convenient" sin

> "We can just use Puppeteer to generate the PDF — it's only one line of
> code."

**Why it fails:** Puppeteer pulls Chromium (~300 MB on disk, ~500 MB RAM
idle). On e2-micro this competes with Postgres for RAM and causes OOMs.
The "one line of code" hides hundreds of MB of resource cost. Browser-side
pdf-lib is 50 KB and runs in 200ms. Always use the browser.

### 9.4 The "background job for slow operations" reflex

> "This rendering is slow, let's just queue it and process async."

**Why it fails:** Queues require workers. Workers are processes. Processes
require RAM. Now we have a worker that holds image buffers in memory while
processing. And we have to monitor queue depth, retry failed jobs, prevent
duplicate processing, clean up zombies. The whole problem disappears if
the browser does the rendering — slow rendering becomes a 1.5-second wait
on the operator's machine instead of a queue+worker+job tracking system.

### 9.5 The "but it's CDN" misdirection

> "We can put a CDN in front of our render endpoint so it's basically free."

**Why it fails:** CDN caches existing responses. The cache MISS still hits
GCP #1 and runs the rasterization. The first user to render a particular
image suffers, and the box pays the CPU cost. CDN doesn't eliminate the
work, just deduplicates it.

---

## 10. Conditions under which this doctrine should be revisited

The current rules are correct for the current era. If any of these change,
re-open the doctrine deliberately.

- **Infrastructure changes** materially: migrate to Kubernetes, upgrade to
  larger VM types, move to managed services that bill per-request.
- **Customer scale** changes by 10×: from ~10 cybercafes to ~100,
  the trade-offs may change.
- **Regulatory environment** changes: a law requires server-side audit
  trails of printed content, or PII handling on-server.
- **Browser capabilities** change: a critical feature we depend on
  (OffscreenCanvas, IndexedDB quotas, blob URLs in print iframes) gets
  removed or restricted by Chrome.
- **3rd-party API economics** change: the APIs we lean on for ML/OCR/
  background-removal become prohibitively expensive or shut down, forcing
  us to consider self-hosted alternatives.

When revisiting, do not delete this document. Add a new revision below
and explain what changed and why.

---

## 11. Revision log

- **2026-05-25** — Initial doctrine. Captures the architectural decisions
  taken during the Photo Tool design discussions, after observing that
  the e2-micro infrastructure could not absorb server-side rendering
  without destabilizing existing services (WhatsApp, Postgres, hub).
  Establishes "browser is the compute layer" as the foundational rule.
