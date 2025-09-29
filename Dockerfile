# --- STAGE 1: Build ---
FROM oven/bun:alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
RUN bun run build

# --- STAGE 2: Production ---
FROM oven/bun:alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Copier les artefacts de build de SvelteKit
COPY --from=build /app/build ./build
# Copier les dépendances
COPY --from=build /app/node_modules ./node_modules
# Copier les fichiers nécessaires pour faire tourner notre serveur.ts
COPY package.json .
COPY tsconfig.json .
COPY server.ts .
COPY src ./src
COPY data ./data

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

# Utiliser tsx (via bunx) pour exécuter notre serveur TypeScript directement
CMD ["bunx", "tsx", "server.ts"]