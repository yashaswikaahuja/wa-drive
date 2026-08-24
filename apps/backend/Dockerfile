FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
  poppler-utils \
  ca-certificates \
  fontconfig \
  fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY providers ./providers
COPY migrations ./migrations
# Owner panel static bundle (built by CI into ./owner-panel-dist before the image build).
# Served by the tailnet-only owner listener. Optional: absent in local builds → owner API still works.
COPY owner-panel-dist ./owner-panel
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => {if (r.statusCode !== 200) throw new Error(r.statusCode); process.exit(0)}).on('error', e => {console.error(e); process.exit(1)})"
ENTRYPOINT ["/app/entrypoint.sh"]
