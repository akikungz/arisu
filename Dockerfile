FROM node:lts-alpine AS base

RUN apk update && apk upgrade && \
  apk add --no-cache ca-certificates openssl && \
  update-ca-certificates

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN corepack enable pnpm && \
  corepack prepare pnpm@latest --activate && \
  pnpm install --frozen-lockfile

# Build the app
FROM base AS builder
RUN corepack enable pnpm && \
  corepack prepare pnpm@latest --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client with all source files in place
RUN pnpm dlx prisma generate --schema=./src/prisma/schema.prisma

RUN npm run build

# Production image
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

COPY --from=builder --chown=hono:nodejs /app/dist ./dist
COPY --from=builder --chown=hono:nodejs /app/src/prisma/generated ./dist/src/prisma/generated
COPY --from=builder --chown=hono:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=hono:nodejs /app/package.json ./package.json

USER hono

EXPOSE 3000

CMD ["node", "./dist/src/index.js"]
