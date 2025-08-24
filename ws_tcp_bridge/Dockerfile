ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.19
FROM ${BUILD_FROM}

# Add NodeJS
RUN apk add --no-cache nodejs npm

WORKDIR /opt/app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY ws-tcp-bridge.js ./

# Copy run script
COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8765
CMD [ "/run.sh" ]
