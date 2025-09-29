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

# --- STAGE 3: Image de production ---
# Utilise une image Node.js Alpine pour la production
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# On copie l'application buildée depuis l'étape précédente.
COPY --from=build /app/build .
# On copie les dépendances de production.
COPY --from=build /app/node_modules ./node_modules

# On expose le port sur lequel l'application tournera.
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

# La commande pour démarrer le serveur de production.
CMD ["node", "index.js"]