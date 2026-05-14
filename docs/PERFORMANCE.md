# CyberControl Performance Policy

This document defines the performance discipline rules for the platform. These are architectural policies, not optional guidelines.

## 1. Payload Discipline

### List endpoints MUST return summaries only

✅ Allowed in list responses:
- `id`, names, counts, timestamps, status flags
- Computed aggregates (`COUNT()`, `SUM()`, `jsonb_array_length()`)
- Foreign key references (not joined data)

❌ NEVER allowed in list responses:
- `records` JSONB (replay traces)
- `corrections` JSONB arrays
- `data` JSONB blobs (profile fields, etc.)
- Document file contents
- Full episode data
- Full mapping_data JSONB

### Detail endpoints (drill-down) provide full data

```
GET /api/sessions          → summary list
GET /api/sessions/:id      → full session with records
GET /api/corrections       → summary list with counts
GET /api/corrections/:id   → full corrections array
GET /api/profiles          → list without `data` JSONB
GET /api/profiles?full=1   → list with full data (admin only)
GET /api/profiles/:id      → full profile
```

## 2. Query Limits Policy

Every list endpoint MUST support:
- `limit` query param (default 50, max 200)
- `offset` query param (default 0)

Reject responses without explicit pagination.

## 3. WhatsApp / Document Subsystem Constraints

The WhatsApp + documents subsystem is the highest scaling risk.

❌ NEVER:
- Render all media at once
- Preload videos
- Decode PDFs eagerly
- Keep full media arrays in Zustand
- Fetch all history by default

✅ Always:
- Progressive loading
- Intersection-observer for thumbnails
- Pagination
- Lazy hydration

## 4. Runtime Optimization Constraints

❌ DO NOT optimize away:
- Replay recording
- Correction capture
- Strategy attribution
- Deterministic sequencing
- Plugin observability metadata

✅ Safe to optimize:
- Redundant DOM scans
- Observer frequency
- Repeated `querySelector` calls
- Layout recalculation hot paths

## 5. Frontend Architecture Rules

- All routes MUST be `React.lazy()` loaded
- Heavy components (socket.io, pdf viewers, large tables) MUST be in lazy chunks
- List components rendering >50 items MUST use memoization
- Image components MUST use intersection observer for offscreen rendering
- Global state stores MUST use fine-grained selectors

## 6. Performance Metrics Targets

| Metric | Target |
|--------|--------|
| Initial bundle (gzipped) | < 80KB |
| Dashboard first render | < 1.5s |
| Route transition | < 200ms |
| API response (list endpoints) | < 200ms |
| Inbox scroll | 60fps |
| WhatsApp page load (cached) | < 500ms |

## 7. Slow Request Threshold

Backend timing middleware logs any request > 200ms to the ring buffer.

Admins can view recent slow requests via:
```
GET /api/admin/metrics
```

Returns aggregated stats by endpoint + recent slow requests.

## 8. Observability Constraints

Keep observability lightweight:
- No heavy analytics SDKs
- No external monitoring services
- No request body logging (privacy)
- Ring buffer (max 500) for slow requests
- Console.warn for slow paths in development

## 9. Future Warning Areas

Keep watching:
- Sessions table growth → pagination always required
- Corrections aggregation queries → may need materialized views
- WhatsApp media rendering → virtualization required at >200 items
- Replay JSON size → consider compression at storage layer
- Drive API fanout → cache aggressively
- Admin analytics → never join JSONB blobs at query time

## 10. Migration Rule

When adding a new endpoint:
1. Default to summary-only response
2. Add pagination params
3. Create separate `/:id` detail endpoint if needed
4. Add to this document

When changing an endpoint:
- Reducing payload size: safe
- Increasing payload size: requires justification + this doc update
- Adding new fields to list endpoints: must be lightweight (no JSONB)
