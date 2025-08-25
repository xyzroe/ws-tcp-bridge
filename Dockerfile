# Multi-stage build for better optimization
FROM node:18-alpine AS builder

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine

# Install jq and su-exec for Home Assistant addon support
RUN apk add --no-cache jq su-exec

# Create non-root user (for non-HA mode)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create app directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy app source
COPY package*.json ./
COPY ws-tcp-bridge.js ./

# Copy HA addon wrapper script
COPY ws-tcp-bridge-ha/run.sh ./run.sh
RUN chmod +x ./run.sh

# Set environment
ENV NODE_ENV=production
ENV PORT=8765

# Expose default WS port
EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/mdns?types=local || exit 1

# Smart entrypoint: use HA wrapper if options.json exists, otherwise switch to nodejs user
ENTRYPOINT ["/bin/sh", "-c", "if [ -f /data/options.json ]; then exec ./run.sh; else su-exec nodejs node /app/ws-tcp-bridge.js \"$@\"; fi", "--"]
