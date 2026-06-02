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
EXPOSE 3000
CMD ["node", "dist/index.js"]
