# CyberControl WhatsApp Resolver

Singleton **whatsapp-web.js** oracle for LID→phone, contact names, DP, and system OTP sends (`:3200`).

Workspace package: `cybercontrol-whatsapp-resolver`. Logic lives in `@cybercontrol/wa-resolver` (imported by package name). This folder is the thin entry + Docker/CD root.

```bash
# from monorepo root
pnpm install
pnpm --filter cybercontrol-whatsapp-resolver start

# Docker image (vendors package into dist/ first)
pnpm --filter cybercontrol-whatsapp-resolver build
docker build -f apps/whatsapp-resolver/Dockerfile apps/whatsapp-resolver
```

See `whatsapp-service/WHATSAPP_SERVICE.md` for architecture and env vars.
