# Local / Codespaces test branch (`test/local-codespace`)

This branch is for **debugging with local credentials only**.  
It is **not** production. Do not put real `JWT_SECRET`, DB passwords, or API keys here.

## What this gives you

1. **Codespace / local Postgres** with known dummy credentials  
2. **extension-service `.env`** template aimed at that DB  
3. **Optional fill-plan trace** (`DEBUG_FILL_TRACE=1`) — logs redacted request/response for `/fill-plan` and `/fill-observation` on the **server**  
4. **Mint a local JWT** matching the local secret so the extension can call the API  

No debug UI is added to the product extension. You watch the **server terminal**.

## Codespaces flow

1. Open this repo in GitHub Codespaces **on branch `test/local-codespace`**.  
2. Wait for `postCreate` (npm install + copy env).  
3. Start Postgres (if not already):  
   `docker compose -f .devcontainer/docker-compose.yml up -d postgres`  
4. Start API:  
   ```bash
   cd extension-service
   # ensure .env exists (from .devcontainer/env.codespace.example)
   npm run dev
   ```  
5. Forward port **3300** (public or private — extension on your PC needs to reach it).  
6. Mint a token:  
   ```bash
   node scripts/mint-local-token.mjs
   ```  
7. On your **local Chrome** unpacked extension (`phase-3-perception` or this branch’s `extension/`):  
   In the service worker / console or a one-shot storage set:  
   - `backendUrl` = `https://<your-codespace>-3300.app.github.dev/api`  
     (or `http://127.0.0.1:3300/api` if you run the API on the same machine as Chrome)  
   - `accessToken` = token from step 6  

8. Run **Fill Form**. Watch Codespace terminal for:  
   `[fill-trace] REQUEST ...` / `[fill-trace] RESPONSE ...`

## Local credentials (defaults)

| Variable | Local value |
|---|---|
| `DATABASE_URL` | `postgresql://cybercontrol_local:cybercontrol_local_dev@127.0.0.1:5432/cybercontrol_local` |
| `JWT_SECRET` | `local-codespace-jwt-secret-not-for-prod` |
| `PORT` | `3300` |
| `DEBUG_FILL_TRACE` | `1` |

These match `.devcontainer/env.codespace.example` and docker-compose.

## Important

- **Never** paste production tokens into this branch’s docs or commit `.env`.  
- Production `backendUrl` / secrets stay in your real deploy; switch storage back when finished.  
- Schema/migrations may still be required for a full fill; if DB is empty, plan may return empty steps — still useful to see the **request/response shape**.  
- Chrome extension itself does **not** run inside Codespaces; only the API/DB do.

## Branch hygiene

- Prefer **not** merging this branch into `master` / `phase-3-perception` without stripping debug middleware if you don’t want it.  
- Or keep this branch forever as a **debug lane** and cherry-pick only real product commits onto it.
