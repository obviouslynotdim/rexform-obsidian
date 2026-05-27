# ── Stage 1: Build VitePress ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY docs/package*.json ./docs/
RUN cd docs && npm install --prefer-offline

# Copy vault content (markdown + VitePress config)
COPY . .

# Build the static site
RUN cd docs && npx vitepress build

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/docs/.vitepress/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
