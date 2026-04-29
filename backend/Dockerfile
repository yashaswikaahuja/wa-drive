FROM node:20-slim
RUN apt-get update && apt-get install -y git --no-install-recommends && rm -rf /var/lib/apt/lists/*
# Rewrite SSH git URLs to HTTPS so npm can fetch without SSH keys
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
