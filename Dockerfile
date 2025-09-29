# --- STAGE 1: Build ---
FROM node:20-alpine AS build
WORKDIR /app

# Copier les fichiers de manifeste
COPY package.json ./

# Installer les dépendances
RUN npm install

# Copier tout le reste du code source
COPY . .

# Lancer le build de production
RUN npm run build

# --- STAGE 2: Production ---
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Copier uniquement les fichiers nécessaires depuis l'étape de build
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./

# Installer les dépendances de production
RUN npm install --production

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

# Lancer le serveur de production généré par SvelteKit
CMD ["node", "build/index.js"]