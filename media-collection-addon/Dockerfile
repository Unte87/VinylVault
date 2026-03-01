ARG BUILD_FROM=ghcr.io/hassio-addons/base:15.0.8
FROM $BUILD_FROM

# Install Node.js (LTS) and build dependencies for better-sqlite3
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Copy application source
WORKDIR /app
COPY app/package*.json ./

# Install Node.js dependencies (includes native compilation for better-sqlite3)
RUN npm ci --omit=dev

COPY app/ ./

# Expose ingress port
EXPOSE 8099

# Copy startup script
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
