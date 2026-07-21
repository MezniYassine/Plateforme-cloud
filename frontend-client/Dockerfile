# ── Stage 1 : build Angular SSR ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2 : production ─────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Dépendances de runtime uniquement (express, etc.)
COPY package*.json ./
RUN npm ci --omit=dev

# Artéfact SSR compilé
COPY --from=builder /app/dist ./dist

EXPOSE 4000

# Démarre le serveur SSR Angular
CMD ["node", "dist/frontend-client/server/server.mjs"]
