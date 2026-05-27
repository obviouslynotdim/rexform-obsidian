# ── Stage 1: Build VitePress ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY docs/package*.json ./docs/
RUN cd docs && npm install --prefer-offline

# Copy vault content (markdown + VitePress config)
COPY . .

# Symlink node_modules to vault root so Vue SSR imports resolve correctly.
# VitePress processes .md files as Vue SFCs from /app (vault root), but
# node_modules lives in /app/docs/ — this makes them discoverable.
RUN ln -s /app/docs/node_modules /app/node_modules

# Build the static site
RUN cd docs && npx vitepress build

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/docs/.vitepress/dist /usr/share/nginx/html

# Use a config template — Railway injects $PORT at runtime (not always 80)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# envsubst replaces ${PORT} then nginx starts
EXPOSE 8080
CMD ["/bin/sh", "-c", \
  "export PORT=${PORT:-8080} && \
   envsubst '${PORT}' < /etc/nginx/templates/default.conf.template \
     > /etc/nginx/conf.d/default.conf && \
   nginx -g 'daemon off;'"]
