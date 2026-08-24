# Expects CI (or local `pnpm --filter cybercontrol-extension-service build`) to
# produce dist/ with vendored @cybercontrol/svc-* packages before docker build.
FROM node:20-alpine
WORKDIR /app
COPY dist/package.json ./
RUN npm install --omit=dev
COPY dist/ ./
EXPOSE 3300
CMD ["node", "index.js"]
