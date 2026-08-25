# Expects CI (or local `pnpm --filter cybercontrol-whatsapp-resolver build`) to
# produce dist/ with vendored @cybercontrol/wa-resolver before docker build.
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  ca-certificates \
  fonts-liberation \
  git \
  && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
# Copy full dist first — package.json uses file:./vendor/wa-* workspace vendoring.
COPY dist/ ./
RUN npm install --omit=dev
RUN mkdir -p /app/session /app/.wwebjs_auth
VOLUME ["/app/session", "/app/.wwebjs_auth"]
EXPOSE 3200
CMD ["node", "index.js"]
