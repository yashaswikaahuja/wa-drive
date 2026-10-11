# Pre-built by CI: pnpm --filter cybercontrol-frontend build (workspace deps need monorepo pnpm).
FROM nginx:alpine
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
