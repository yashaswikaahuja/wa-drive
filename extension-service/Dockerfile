FROM node:20-alpine
ARG BUILD_SHA=development
ENV BUILD_SHA=$BUILD_SHA
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3300
CMD ["node", "index.js"]
