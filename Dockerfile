# Minimal runtime image for ws-tcp-bridge
FROM node:18-alpine

# Create non-root workdir
WORKDIR /app

# Install production deps first (leverage Docker cache)
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy app sources
COPY ws-tcp-bridge.js ./

# Default env
ENV NODE_ENV=production

# Expose default WS port
EXPOSE 8765

# Use the node user for better security
USER node

# Run the bridge (port can be overridden by passing an arg)
ENTRYPOINT ["node", "/app/ws-tcp-bridge.js"]
