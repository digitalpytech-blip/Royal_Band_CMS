#!/usr/bin/env bash
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env. Edit ADMIN_PASSWORD, SESSION_SECRET and SITE_URL before production."
fi
node --check server.js
mkdir -p public/uploads data
[ -f data/leads.json ] || echo '[]' > data/leads.json
echo "Syntax OK. Start with: node server.js"
