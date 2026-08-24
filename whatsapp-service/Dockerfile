# Expects CI (or a local `pnpm --filter cybercontrol-whatsapp-service build`) to
# produce dist/ with vendored @cybercontrol/wa-* packages before docker build.
FROM node:20-slim
WORKDIR /app
COPY dist/package.json ./
RUN npm install --omit=dev
COPY dist/ ./
RUN mkdir -p /app/sessions /app/upload_queue
VOLUME ["/app/sessions", "/app/upload_queue"]
EXPOSE 3100
CMD ["node", "index.js"]
