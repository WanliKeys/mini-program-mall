#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/Users/liwanli/Documents/GitHub/mall"
APP_DIR="$ROOT_DIR/wx-backend"

echo "🔧 Killing legacy backend processes..."
pkill -f "$APP_DIR/src/app.js" 2>/dev/null || true
pkill -f "node src/app.js" 2>/dev/null || true

echo "🚀 Starting backend (single instance)..."
cd "$APP_DIR"
PORT=${PORT:-3000} NODE_ENV=${NODE_ENV:-development} npm run start


