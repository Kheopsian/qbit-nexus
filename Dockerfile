# --- STAGE 1: Installation des dépendances ---
# On utilise l'image officielle de Bun, légère et optimisée.
FROM oven/bun:alpine AS install
WORKDIR /app

# On copie uniquement les fichiers nécessaires à l'installation.
COPY package.json bun.lock ./

# On installe les dépendances. --frozen-lockfile est l'équivalent de `npm ci`
# pour garantir des builds reproductibles.
RUN bun install --frozen-lockfile --verbose

# --- STAGE 2: Build de l'application ---
FROM install AS build
WORKDIR /app

# On copie les dépendances déjà installées et le reste du code source.
COPY --from=install /app/node_modules ./node_modules
COPY . .

# On lance le build SvelteKit avec Bun.
RUN bun run build

# --- STAGE 3: Image de production (Corrected) ---
FROM oven/bun:alpine AS production
WORKDIR /app

# Set the NODE_ENV to production
ENV NODE_ENV=production

# Copy the built app from the build stage
COPY --from=build /app/build .
# Copy production dependencies and package files
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock

# Expose port and set env vars
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

# Start the app using Node.js
CMD ["node", "index.js"]