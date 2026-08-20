FROM node:20-slim

# Install OpenSSL for Prisma Client
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Copy root configurations and shared packages
COPY package*.json tsconfig.base.json ./
COPY packages/ ./packages/

# Copy desktop package.json (required for npm workspace resolution)
COPY apps/desktop/package.json ./apps/desktop/package.json

# Copy server package
COPY apps/server/ ./apps/server/

# Install dependencies only for the server workspace (excludes desktop's Electron dependencies)
RUN npm ci --workspace=@devsync/server

# Generate Prisma Client
WORKDIR /app/apps/server
RUN npx prisma generate

EXPOSE 3000

# Let Docker know when the server is healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Ensure Docker sends SIGTERM so our graceful shutdown runs
STOPSIGNAL SIGTERM

CMD ["npx", "tsx", "src/app.ts"]
