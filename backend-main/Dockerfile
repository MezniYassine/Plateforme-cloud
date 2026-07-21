# ── Stage 1 : build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les manifestes puis installer TOUTES les dépendances (dev inclus)
COPY package*.json ./
RUN npm ci

# Copier les sources et compiler
COPY . .
RUN npm run build

# ── Stage 2 : production ─────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Installer seulement les dépendances de production
COPY package*.json ./
RUN npm ci --omit=dev

# Copier l'artéfact compilé
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main"]
