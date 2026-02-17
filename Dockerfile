FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (tsx/typescript needed at runtime)
RUN npm ci

# Copy server, shared, public, and migration files
COPY server ./server
COPY shared ./shared
COPY public ./public
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY tsconfig.json ./

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Start the server
CMD ["npx", "tsx", "server/index.production.ts"]
