# Expects CI (or local `pnpm --filter cybercontrol-whatsapp-service build`) to
# produce dist/ with vendored @cybercontrol/wa-* packages before docker build.
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Copy full dist first — package.json uses file:./vendor/wa-* workspace vendoring.
COPY dist/ ./
RUN npm install --omit=dev
RUN mkdir -p /app/sessions /app/upload_queue
VOLUME ["/app/sessions", "/app/upload_queue"]
EXPOSE 3100
CMD ["node", "index.js"]
