# CyberControl — Owner Control Panel

Tailnet-only dashboard for **Level-1 customers** (the cybercafés = `workspaces`). It talks to the
owner API that runs on a cybercontrol-app VM, bound to its **tailscale IP** — never exposed publicly.

```
[ this panel ]  --(tailnet)-->  http://100.112.147.34:3010/owner/*
   x-owner-key: <OWNER_KEY>              (gate = tailnet + OWNER_KEY)
```

## What it shows
- **Metrics:** Active (30d), Paying, Signups, New this month/week, Churned, Dormant.
- **Cybercafés:** per-café operators, WhatsApp connected?, files processed, last active, plan, status.

## Run
```bash
cd owner-panel
npm install
npm run dev        # http://localhost:5180  (or over the tailnet: http://<this-device-tailnet-ip>:5180)
```
On first load it asks for the **Owner API URL** (default `http://100.112.147.34:3010`) and your
**OWNER_KEY**. Both are stored locally on the device. The ⚙ button re-opens that screen.

Build a static bundle with `npm run build` (output in `dist/`) to host it on any tailnet device.

## Requirements
- The device must be on the **tailnet** (off-tailnet requests get `403`).
- Backend must have `OWNER_PORT` / `OWNER_BIND` / `OWNER_KEY` set (see backend `config.ts`).

> Note: the API is served over HTTP on the tailnet, so run this panel over HTTP too (no mixed-content).
