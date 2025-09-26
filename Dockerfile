# --- STAGE 1: Installation des dépendances ---
# On utilise l'image officielle de Bun, légère et optimisée.
FROM oven/bun:1.1-alpine AS install
WORKDIR /app

# On copie uniquement les fichiers nécessaires à l'installation.
COPY package.json bun.lockb ./

# On installe les dépendances. --frozen-lockfile est l'équivalent de `npm ci`
# pour garantir des builds reproductibles.
RUN bun install --frozen-lockfile

# --- STAGE 2: Build de l'application ---
FROM install AS build
WORKDIR /app

# On copie les dépendances déjà installées et le reste du code source.
COPY --from=install /app/node_modules ./node_modules
COPY . .

# On lance le build SvelteKit avec Bun.
RUN bun run build

# --- STAGE 3: Image de production ---
FROM oven/bun:1.1-alpine AS production
WORKDIR /app

# On copie uniquement le build final depuis l'étape précédente.
COPY --from=build /app/build ./build
# On copie aussi le package.json, qui peut être utile.
COPY --from=build /app/package.json ./package.json
# Et les dépendances de production.
COPY --from=build /app/node_modules ./node_modules


# On expose le port sur lequel l'application tournera.
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

# La commande pour démarrer le serveur de production SvelteKit avec Bun.
CMD ["bun", "build/index.js"]