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
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY providers ./providers
COPY migrations ./migrations
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => {if (r.statusCode !== 200) throw new Error(r.statusCode); process.exit(0)}).on('error', e => {console.error(e); process.exit(1)})"
ENTRYPOINT ["/app/entrypoint.sh"]
