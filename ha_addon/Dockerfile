FROM node:18-bullseye-slim

ENV LANG C.UTF-8

# Install build deps often required by native modules (serialport) and jq for options parsing
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config libusb-1.0-0-dev jq ca-certificates udev git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package files first for dependency install
COPY package*.json ./
RUN npm ci --only=production || npm i --only=production

# Copy app
COPY . .

# Make run script executable
RUN chmod +x /usr/src/app/ha_addon/run.sh

EXPOSE 8765

CMD ["/usr/src/app/ha_addon/run.sh"]
