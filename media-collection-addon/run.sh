#!/usr/bin/with-contenv bashio

# Ensure /data directory exists and is writable
mkdir -p /data

# Export DB path so the Node.js app can pick it up
export DB_PATH="/data/collection.db"
export PORT="8099"

# Read ingress entry point from Home Assistant supervisor (if available)
if bashio::var.has_value "$(bashio::addon.ingress_entry 2>/dev/null)"; then
  export INGRESS_PATH="$(bashio::addon.ingress_entry)"
else
  export INGRESS_PATH=""
fi

bashio::log.info "Starting MediaDock on port ${PORT}..."
bashio::log.info "Database path: ${DB_PATH}"
bashio::log.info "Ingress entry: ${INGRESS_PATH}"

exec node /app/server.js
