FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/sessions /app/upload_queue
VOLUME ["/app/sessions", "/app/upload_queue"]
EXPOSE 3100
CMD ["node", "index.js"]
