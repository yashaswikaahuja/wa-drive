# CyberControl — Owner Control Panel

Tailnet-only dashboard for **Level-1 customers** (the cybercafes = `workspaces`). It talks to the
owner API that runs on a cybercontrol-app VM, bound to its **tailscale IP** — never exposed publicly.

```
[ this panel ]  --(tailnet)-->  http://cybercontrol-app.taild72c71.ts.net:3010/owner/*
   x-owner-key: <OWNER_KEY>              (gate = tailnet + OWNER_KEY)
```

## What it shows
- **Metrics:** Active (30d), Paying, Signups, New this month/week, Churned, Dormant.
- **Cybercafes:** per-cafe operators, WhatsApp connected?, files processed, last active, plan, status.
- **Learning (moved from Hub /admin):** Form Mappings, Fill Sessions, Corrections, plus extract-maps/AI under AI.
  Cafe Hub keeps Operators only so owners can invite employees without the learning clutter.

## Run
```bash
cd owner-panel
npm install
npm run dev        # http://localhost:5180  (or over the tailnet: http://<this-device-tailnet-ip>:5180)
```
On first load it asks for the **Owner API URL** (default
`http://cybercontrol-app.taild72c71.ts.net:3010`) and your **OWNER_KEY**. Both are stored
locally on the device. The ⚙ button re-opens that screen. Prefer the MagicDNS FQDN over the
short name `cybercontrol-app` (Windows NRPT only matches `*.ts.net`) and never a stale CGNAT
IP. When this panel is served from :3010 itself, the API is same-origin.

Build a static bundle with `npm run build` (output in `dist/`) to host it on any tailnet device.

## Requirements
- The device must be on the **tailnet** (off-tailnet requests get `403`).
- Backend must have `OWNER_PORT` / `OWNER_BIND` / `OWNER_KEY` set (see backend `config.ts`).

> Note: the API is served over HTTP on the tailnet, so run this panel over HTTP too (no mixed-content).
