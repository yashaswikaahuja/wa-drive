FROM node:20-slim
RUN apt-get update && apt-get install -y \
  git ca-certificates chromium \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
 && git config --global http.sslVerify false
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# Pre-populate the WA Web version cache so whatsapp-web.js doesn't need a remote fetch
RUN mkdir -p .wwebjs_cache && \
    cp src/assets/wa-web.html .wwebjs_cache/2.3000.1038411376.html
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
