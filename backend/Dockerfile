# ---- Build Stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci --omit=dev && chown -R node:node /app/node_modules

COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 8000

CMD ["node", "dist/server.js"]
