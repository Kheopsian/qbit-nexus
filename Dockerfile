# --- STAGE 1: Installation des dépendances ---
FROM oven/bun:alpine AS install
WORKDIR /app

# On copie uniquement les fichiers nécessaires à l'installation.
COPY package.json bun.lock ./

# On installe les dépendances.
RUN bun install --frozen-lockfile --verbose

# --- STAGE 2: Build de l'application ---
FROM install AS build
WORKDIR /app

# On copie les dépendances déjà installées et le reste du code source.
COPY --from=install /app/node_modules ./node_modules
COPY . .

# On lance le build SvelteKit.
RUN bun run build

# --- STAGE 3: Production ---
FROM node:18-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules

# On copie notre serveur personnalisé
COPY server.js .

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

# On démarre notre serveur personnalisé au lieu de celui par défaut
CMD ["node", "server.js"]