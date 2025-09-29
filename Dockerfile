# --- STAGE 1: Build ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# --- STAGE 2: Production ---
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Copier les fichiers nécessaires
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
# On copie notre nouveau serveur !
COPY --from=build /app/server.js ./server.js

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

# On lance notre serveur au lieu de celui de SvelteKit
CMD ["node", "server.js"]