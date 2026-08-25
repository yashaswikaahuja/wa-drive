# Expects CI (or local `pnpm --filter cybercontrol-extension-service build`) to
# produce dist/ with vendored @cybercontrol/svc-* packages before docker build.
FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
# Copy full dist first — package.json uses file:./vendor/svc-* workspace vendoring.
COPY dist/ ./
RUN npm install --omit=dev
EXPOSE 3300
CMD ["node", "index.js"]
