# ==========================================
# Stage 1: Build Stage
# ==========================================
FROM node:26-alpine AS builder

WORKDIR /app

# Install dependencies needed for build tools
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source files & configurations
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY frontend ./frontend

# Build TypeScript backend and Vite frontend SPA (outputs to dist/ and dist/frontend/)
RUN npm run build

# ==========================================
# Stage 2: Production Runtime Stage
# ==========================================
FROM node:26-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV OUTPUT_DIR=/app/inbox
ENV AUTH_DIR=/app/auth_info_baileys

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built server & frontend artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Create persistent storage directories
RUN mkdir -p /app/inbox /app/auth_info_baileys

# Expose backend & frontend port
EXPOSE 3001

# Healthcheck to verify the server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-3001}/api/status || exit 1

# Start production server
CMD ["node", "dist/server.js"]
