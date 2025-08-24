FROM node:18-bullseye-slim

ENV LANG=C.UTF-8

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config libusb-1.0-0-dev jq ca-certificates udev git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
# Use npm install to avoid requiring a lockfile inside add-on context
RUN npm install --omit=dev

COPY . .

RUN chmod +x /usr/src/app/run.sh \
 && cp /usr/src/app/run.sh /usr/local/bin/ws-tcp-bridge-run.sh \
 && chmod +x /usr/local/bin/ws-tcp-bridge-run.sh

EXPOSE 8765

CMD ["/usr/local/bin/ws-tcp-bridge-run.sh"]
