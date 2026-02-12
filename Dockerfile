FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy server and shared files
COPY server ./server
COPY shared ./shared
COPY public ./public
COPY tsconfig.json ./

# Build TypeScript
RUN npm install -g tsx

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Start the server
CMD ["npx", "tsx", "server/index.production.ts"]
