#!/usr/bin/env bash
set -e

APP_DIR="/home/master/applications/znfjdnxytk/public_html"
APP_NAME="athena"
PORT="3001"

cd "$APP_DIR"

echo "== Athena deploy started =="

git pull origin main

npm install

npm run build

pm2 restart "$APP_NAME" || pm2 start "npm run start -- -p $PORT" --name "$APP_NAME"

pm2 save

sleep 2

curl -f -I "http://127.0.0.1:$PORT" >/dev/null

echo "== Athena deploy successful =="
