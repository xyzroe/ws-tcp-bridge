ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.19
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Add NodeJS and required packages
RUN apk add --no-cache \
    nodejs \
    npm \
    wget

# Set working directory
WORKDIR /opt/app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy application files
COPY ws-tcp-bridge.js ./

# Copy run script
COPY run.sh /run.sh
RUN chmod +x /run.sh

# Set environment
ENV PORT=8765
ENV NODE_ENV=production

# Expose port
EXPOSE 8765

# Labels for Home Assistant
LABEL \
    io.hass.name="WS TCP Bridge" \
    io.hass.description="WebSocket to TCP bridge with mDNS and serial support" \
    io.hass.arch="aarch64|amd64|armv7" \
    io.hass.type="addon" \
    io.hass.version="0.1.2"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/mdns?types=local || exit 1

# Run
CMD [ "/run.sh" ]
