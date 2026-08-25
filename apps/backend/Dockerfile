# DEPRECATED for monorepo builds.
# Use apps/backend/Dockerfile.monorepo with build context = repo root
# (CI: .github/workflows/docker-publish.yml, compose: docker-compose.yml).
#
# Kept so accidental `docker build -f apps/backend/Dockerfile ./apps/backend`
# fails loudly instead of producing a broken image (workspace:* deps).
FROM node:20-slim
RUN echo "ERROR: Use apps/backend/Dockerfile.monorepo with context=repo root" >&2 && exit 1
