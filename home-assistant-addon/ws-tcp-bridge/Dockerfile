ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.19
FROM ${BUILD_FROM}

# Add NodeJS
RUN apk add --no-cache nodejs npm

# Copy runtime from the published image to keep logic in one place (multi-arch)
# Alternatively, we could rebuild here; but using the same image ensures parity
ARG ADDON_ARCH="amd64"
ENV PORT=8765

# Pull the app image layer-by-layer isn't trivial with plain Dockerfile, so we install app directly
WORKDIR /opt/app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY ws-tcp-bridge.js ./

# Copy run script
COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8765
CMD [ "/run.sh" ]
