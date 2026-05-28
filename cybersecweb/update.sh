#!/bin/bash
echo "=== Pulling latest code ==="
git pull origin main

echo "=== Building frontend ==="
cd client && npm install && npm run build
cd ..

echo "=== Restarting server ==="
pm2 restart all 2>/dev/null || node server/index.js &

echo "=== DONE! Unban ab kaam karega ==="
