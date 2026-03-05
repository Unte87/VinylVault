#!/bin/sh

mkdir -p /data

export DB_PATH="/data/collection.db"
export PORT="8099"
export INGRESS_PATH=""

echo "Starting MediaDock on port ${PORT}..."
exec node /app/server.js
