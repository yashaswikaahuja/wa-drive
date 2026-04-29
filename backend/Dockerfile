FROM node:20-slim
RUN apt-get update && apt-get install -y git ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
 && git config --global http.sslVerify false
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
