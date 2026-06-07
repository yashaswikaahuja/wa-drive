# Networking Architecture

Diagram-first reference for how every piece of CyberControl talks to every other piece.
Minimal prose — read the diagrams, the tables are the detail.

> Legend
> ```
>   ──►  request / connection direction      ═══  Tailscale mesh (encrypted, 100.x)
>   :NNN listening port                       (N) number of instances
>   ⚡   websocket (long-lived)               ❤   heartbeat
> ```

---

## 0. The one-line mental model

```
  public internet  →  [ TLS edge ]  →  [ app tier ]  ═══tailnet═══  [ data + worker tier ]
       browsers          nginx          backend/ext                  db, redis, whatsapp
```

Two trust zones:
- **Public zone** — only the TLS edge (nginx / Vercel) is exposed to the internet.
- **Private zone (tailnet)** — backend, extension-service, Postgres, Redis, WhatsApp shards, resolver.
  Nothing here has a public port; they reach each other by **MagicDNS name over Tailscale**.

---

## 1. Port map (every listener)

```
  TIER                SERVICE              PORT   PROTO   EXPOSED TO
  ──────────────────  ───────────────────  ─────  ──────  ─────────────────────────
  edge                nginx (TLS)          443    https   PUBLIC
  edge                nginx                 80    http    PUBLIC (redirect → 443)
  app                 backend              3000   http+ws tailnet only
  app                 extension-service    3300   http    tailnet only
  worker              whatsapp-service     3100   http    tailnet only
  worker              resolver             3200   http    tailnet only
  data                postgres             5432   tcp     tailnet only
  data                redis                6379   tcp     tailnet only   (scaled mode)
  mesh                tailscaled         41641   udp     WAN (NAT-traversal)
```

Rule of thumb: **only 443/80 face the internet.** Everything else is tailnet-private.

---

## 2. Names — how services find each other

No hard-coded IPs. Everything resolves through **Tailscale MagicDNS**.

```
  CALLER            ENV VAR / CONFIG          RESOLVES TO (MagicDNS)        PORT
  ───────────────   ───────────────────────   ──────────────────────────   ────
  backend           DATABASE_URL              cybercontrol-db              5432
  backend           REDIS_URL                 cybercontrol-redis*          6379
  backend           WA_SERVICE                cybercontrol-wa              3100
  backend           WA_INSTANCES (csv)        cybercontrol-wa, ...-wa-2    3100
  backend           RESOLVER_URL              cybercontrol-wa (resolver)   3200
  extension-service DATABASE_URL              cybercontrol-db              5432
  whatsapp-service  PARENT_URL                cybercontrol-app (backend)   3000
  whatsapp-service  DATABASE_URL              cybercontrol-db              5432

  * Redis location is a deployment choice (see §7). Could be its own VM or co-located on the db box.
```

---

## 3. Current production topology (single-instance app tier)

```
   ┌─────────────┐  static
   │   Vercel    │  frontend (SPA)
   └──────┬──────┘
          │ https://api.cybercontrol.fun
          ▼
   ┌──────────────────────── cybercontrol-app VM ────────────────────────┐
   │  ┌────────────┐                                                      │
   │  │  nginx :80 │  path routing                                        │
   │  └──┬──────┬──┘                                                      │
   │     │      │                                                         │
   │     ▼      ▼                                                         │
   │ ┌────────┐ ┌────────────────────┐    in-memory state lives here:    │
   │ │backend │ │ extension-service  │      • QR cache (Map)              │
   │ │ :3000  │ │      :3300         │      • socket.io (1 process)       │
   │ │  (1)   │ │       (1)          │    local-disk state:               │
   │ └───┬────┘ └─────────┬──────────┘      • DATA_DIR/*.json (ext-svc)   │
   └─────┼────────────────┼─────────────────────────────────────────────┘
         │                │
   ══════╪════════════════╪═══════════ Tailscale mesh ═══════════════════════
         │                │
         │                └────────────────┐
         ▼                                 ▼
   ┌──────────────────────┐        ┌─────────────────────┐
   │ whatsapp-service      │ ❤───►  │  cybercontrol-db    │
   │  wa   :3100  ─┐       │ creds  │   Postgres :5432    │
   │  wa-2 :3100  ─┤ shards│◄────── │   (single)          │
   │  resolver :3200 (1)   │ resume └─────────────────────┘
   └──────────────────────┘
```

State that blocks scaling the app tier:
```
   backend  → QR cache + socket.io events held IN-PROCESS  → 2nd copy wouldn't see them
   ext-svc  → mappings/adapters on LOCAL DISK              → 2nd copy would diverge
```

---

## 4. Scaled topology (pool behind a load balancer)

```
                       browsers / extension
                              │ https
                              ▼
                  ┌────────────────────────┐
                  │   nginx LB ("parent")  │   /api        → least_conn
                  │        :80/:443        │   /socket.io  → ip_hash (sticky)
                  └──┬──────┬─────────┬────┘
        ┌────────────┘      │         └─────────────┐
        ▼                   ▼                        ▼
  ┌──────────┐        ┌──────────┐            ┌──────────┐ ┌──────────┐
  │backend-1 │        │backend-2 │  …(N)      │  ext-1   │ │  ext-2   │ …(N)
  │  :3000   │        │  :3000   │            │  :3300   │ │  :3300   │
  └────┬─────┘        └────┬─────┘            └────┬─────┘ └────┬─────┘
       │   all state is shared, not in-process     │            │
       └──────────┬───────────────┬────────────────┴────────────┘
                  ▼               ▼                              ▼
            ┌───────────┐   ┌───────────┐                ┌───────────────┐
            │  Redis    │   │  Redis    │                │  Postgres     │
            │ socket.io │   │ QR cache  │                │ app data +    │
            │ adapter   │   │ wa:qr:<ws>│                │ ext_kv_store  │
            └───────────┘   └───────────┘                │ + wa_* tables │
            (one Redis serves both uses)                 └───────┬───────┘
                                                                 │
   ══════════════════ Tailscale mesh ════════════════════════════╪═══════
                                                                 ▼
                                            ┌────────────────────────────┐
                                            │ whatsapp-service shards     │
                                            │  wa, wa-2, wa-3 … :3100     │
                                            │  + resolver :3200           │
                                            └────────────────────────────┘
```

Pool nodes are **interchangeable**: add one = start a container + add it to the LB upstream. No state migration, because state lives in Redis + Postgres.

---

## 5. Flow walkthroughs

### 5.1 Plain HTTP request
```
  browser ─► LB ─(least_conn)─► backend-N ─► Postgres ─► response
                                    └─ stateless, any backend is equivalent
```

### 5.2 WebSocket (realtime UI) — why it needs BOTH stickiness AND Redis
```
  browser ═⚡═► LB ═(ip_hash)═► backend-2     socket is PINNED here (can't split a connection)
                                   ▲
   event born on backend-1 ─► Redis adapter ─► fanned to backend-2 ─► client sees it
```
```
   ip_hash  = the connection stays on one backend
   Redis    = events from OTHER backends still reach that connection
   (need both — one without the other breaks multi-instance realtime)
```

### 5.3 WhatsApp linking (QR) — across the pool
```
  1  user "connect"   ─► LB ─► backend-A ─► waBase() picks shard ─► POST wa:3100 /sessions/start
  2  shard makes QR   ─► POST backend /api/worker/event {qr}
  3  backend caches   ─► Redis  SET wa:qr:<ws>  (TTL 40s)
  4  frontend polls   ─► LB ─► backend-B ─► GET Redis wa:qr:<ws>  ─► QR shown   ← different backend, still works
  5  user scans       ─► shard writes creds ─► Postgres wa_auth_*
  6  "connected"      ─► backend ─► Redis adapter ─► frontend updates live
```

### 5.4 WhatsApp session lifecycle + failover (already live in prod)
```
  assign:   workspace ─► wa_assignments (pinned to a shard)        sticky ≥24h
  health:   shard ─❤every 10s─► backend /instance-heartbeat ─► wa_instances.last_seen
  alive:    request ─► waBase() ─► assigned shard still healthy ─► stays put
  dead:     no ❤ for WA_DEAD_AFTER_MS (30s) ─► reassign to healthy shard
                          └─► new shard restores creds from Postgres ─► NO QR re-scan
```

---

## 6. Backing stores — who uses what

### 6.1 Redis (cache/transport only — losing it never loses data)
```
  USE                KEY / MECHANISM           WHO WRITES        WHO READS
  ─────────────────  ────────────────────────  ───────────────   ───────────────
  socket.io fan-out  pub/sub channels          any backend       all backends
  QR cache           wa:qr:<workspaceId> 40s    backend /event    backend /status,/qr
  fallback if down   in-memory Map per backend  (degrades to single-instance, no crash)
```

### 6.2 Postgres (the single source of truth)
```
  TABLE / GROUP        OWNER             PURPOSE
  ───────────────────  ────────────────  ────────────────────────────────────
  profiles, sessions,  backend           core application data
  jobs, drive_files,
  forms, corrections
  ext_kv_store         extension-service  mappings + adapters (was local files)
  wa_auth_creds/keys   whatsapp-service   session creds → enables no-rescan failover
  wa_instances         backend (writes    shard heartbeats → health/failover
                       on heartbeat)
  wa_assignments       backend           workspace → shard pinning
  agent_plans/traces   extension-service  AI agent history
```

### 6.3 Extension-service (now stateless)
```
  before:  form_mappings.json / adapters.json  ─► local disk  (per-instance, diverges)
  after:   ext_kv_store rows                    ─► Postgres    (shared, every replica equal)
  boot:    ensureSchema() creates the table if missing
  cutover: migrate-files-to-db.js  (one-time: disk JSON ─► DB)
```

---

## 7. Where does Redis live? (deployment choice)

```
  OPTION A — dedicated box            OPTION B — co-located on db
  ┌──────────────────┐                ┌──────────────────────────┐
  │ cybercontrol-redis│               │ cybercontrol-db          │
  │   redis :6379     │               │   postgres :5432         │
  └──────────────────┘                │   redis    :6379         │
   REDIS_URL=                          └──────────────────────────┘
   redis://cybercontrol-redis:6379      REDIS_URL=
                                        redis://cybercontrol-db:6379
   + isolation, + scale separately      + one less VM, simpler
   - one more VM                        - couples cache to db box
```
Either way it's a **tailnet MagicDNS name**; backends reach it over the mesh. Empty `REDIS_URL` = scaled features OFF (single-instance behavior, unchanged).

---

## 8. NGINX routing (the LB ruleset)

```
  LOCATION           UPSTREAM        STRATEGY     NOTES
  ─────────────────  ──────────────  ───────────  ──────────────────────────
  /socket.io/        backend pool    ip_hash      sticky + ws upgrade headers
  /api/profiles      ext pool        least_conn
  /api/mappings      ext pool        least_conn
  /api/adapters      ext pool        least_conn
  /api/sessions      ext pool        least_conn
  /api/corrections   ext pool        least_conn
  /api/training      ext pool        least_conn
  /api/agent         ext pool        least_conn   +60s read timeout (Groq is slow)
  /api/* (rest)      backend pool    least_conn
  /  (everything)    backend pool    least_conn
```
```
  websocket upgrade (required on /socket.io and /):
     proxy_http_version 1.1
     proxy_set_header Upgrade    $http_upgrade
     proxy_set_header Connection "upgrade"
     proxy_read_timeout 86400s        ← keep long-lived sockets open
```
> Gotcha (hit + fixed during testing): a `location` that `include`s shared proxy params **and** sets
> its own `proxy_read_timeout` triggers nginx `duplicate directive` → crash loop. Keep the timeout in
> exactly one place per location.

---

## 9. Tailscale mesh — the private fabric

```
  every node runs tailscaled  ─►  joins tailnet  ─►  gets 100.x IP + MagicDNS name
                                                      tagged: tag:cybercontrol

  WHY a mesh (not a VPC):
   • cloud-agnostic — GCP today, Oracle/AWS/bare-metal tomorrow, same names
   • no public ports on app/data/worker tiers — only the TLS edge is exposed
   • new instance joins in ~seconds and is instantly reachable by name

  JOIN methods:
   • OAuth client (tagged)  ← CD runners + provisioning (non-expiring)
   • auth key               ← manual / one-off
```
```
  test VMs that DON'T need the tailnet:
     a fully self-contained pool (db+redis+services all in ONE vm, one docker net)
     never reaches cybercontrol-db/wa — so it can skip Tailscale.
  REAL pool VMs ALWAYS need the tailnet:
     backend must reach cybercontrol-db, the wa shards, the resolver, redis — all by tailnet name.
```

---

## 10. Failure scenarios

```
  COMPONENT FAILS     CURRENT PROD          SCALED ARCHITECTURE
  ──────────────────  ────────────────────  ─────────────────────────────────────────
  1 backend           ✗ platform down       ✓ LB drops it; sockets reconnect & re-pin
  1 extension-svc     ✗ autofill down       ✓ LB routes to peer; state in Postgres
  Redis               n/a                    ✓ backends fall back to in-mem; realtime
                                              degrades to per-instance until it returns
  1 WhatsApp shard    ✓ failover (no rescan) ✓ same (session restored from Postgres)
  Postgres            ✗ hard down            ✗ STILL the SPOF → needs replica/HA (future)
  resolver            ✗ singleton SPOF       ⚠ still singleton (future: pair it)
  the LB itself       ✗ (single nginx)       ⚠ one LB = SPOF → 2 nginx + DNS RR, or managed LB
  Tailscale node      ✗ that node unreachable ✓ pool node drops out; shard failover covers wa
```

### 10.1 What's still a single point of failure (honest list)
```
  ① Postgres   — everything depends on it          → managed HA / read replica + failover
  ② LB         — one nginx in front of the pool     → two LBs + DNS round-robin, or cloud LB
  ③ resolver   — singleton on cybercontrol-wa        → run a second + make backend pick healthy
```

---

## 11. Reachability matrix (who must reach whom)

```
  FROM \ TO        nginx  backend  ext-svc  postgres  redis  wa-shard  resolver
  browser           ✓      –        –         –        –       –         –
  nginx/LB          –      ✓        ✓         –        –       –         –
  backend           –      –        –         ✓        ✓       ✓         ✓
  extension-svc     –      –        –         ✓        –        –         –
  whatsapp-service  –      ✓(parent) –        ✓        –        –         ✓
  resolver          –      –        –         –        –        ✓         –
   ✓ = must connect   – = no direct path
```
All ✓ between private-zone tiers ride the **Tailscale mesh**.

---

## 12. Quick reference — env vars that wire the network

```
  backend / pool node
    DATABASE_URL   = postgresql://…@cybercontrol-db:5432/cybercontrol
    REDIS_URL      = redis://cybercontrol-redis:6379     (empty = single-instance)
    WA_SERVICE     = http://cybercontrol-wa:3100         (single-instance fallback)
    WA_INSTANCES   = cybercontrol-wa,cybercontrol-wa-2   (csv = sharding on)
    RESOLVER_URL   = http://cybercontrol-wa:3200
    WA_DEAD_AFTER_MS = 30000        WA_HEARTBEAT_MS handled on the shard

  extension-service
    DATABASE_URL   = postgresql://…@cybercontrol-db:5432/cybercontrol
    JWT_SECRET     = (must match backend)

  whatsapp-service (shard)
    PARENT_URL     = http://cybercontrol-app:3000   (or the LB once pooled)
    DATABASE_URL   = postgresql://…@cybercontrol-db:5432/cybercontrol
    WA_INSTANCE_NAME = cybercontrol-wa-N
    WA_AUTH_BACKEND  = postgres
```

---

### See also
- `BACKEND-SCALING.md` — the scaling steps + activation checklist
- `WHATSAPP-SCALING.md` — shard provisioning, sticky/failover ruleset
- `CD.md` — how images + env reach each node
- `../loadbalancer/nginx.conf` — the live LB config
- `../compose/docker-compose.scale.yml` — the multi-instance pool
