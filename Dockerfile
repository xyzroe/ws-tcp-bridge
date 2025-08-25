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

# Install jq for Home Assistant addon support
RUN apk add --no-cache jq

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create app directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy app source
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs ws-tcp-bridge.js ./

# Copy HA addon wrapper script
COPY --chown=nodejs:nodejs ws-tcp-bridge-ha/run.sh ./run.sh
RUN chmod +x ./run.sh

# Set environment
ENV NODE_ENV=production
ENV PORT=8765

# Expose default WS port
EXPOSE 8765

# Use the node user for better security
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/mdns?types=local || exit 1

# Smart entrypoint: use HA wrapper if options.json exists, otherwise direct node
ENTRYPOINT ["/bin/sh", "-c", "if [ -f /data/options.json ]; then exec ./run.sh; else exec node /app/ws-tcp-bridge.js \"$@\"; fi", "--"]
