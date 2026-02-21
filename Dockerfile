# Stage 1: Build Expo web frontend
FROM node:20-alpine AS web-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx expo export --platform web --output-dir dist

# Stage 2: Production server
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev 2>/dev/null || npm ci

# Copy server, shared, and config files
COPY server ./server
COPY shared ./shared
COPY public ./public
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY tsconfig.json ./
COPY poulsbo-rv-inventory.json ./

# Copy built web frontend from stage 1
COPY --from=web-builder /app/dist ./dist

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["npx", "tsx", "server/index.production.ts"]
