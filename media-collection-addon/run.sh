#!/usr/bin/with-contenv bashio

# Ensure /data directory exists and is writable
mkdir -p /data

export DB_PATH="/data/collection.db"
export PORT="8099"
export INGRESS_PATH=""

bashio::log.info "Starting MediaDock on port ${PORT}..."
bashio::log.info "Database: ${DB_PATH}"

exec node /app/server.js
