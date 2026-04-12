#!/bin/bash
# Bootstrap Let's Encrypt certificates for micss-lab.be
# Run this ONCE on the VPS before the first deploy with SSL.
#
# Usage: sudo bash init-letsencrypt.sh

set -e

DOMAIN="micss-lab.be"
EMAIL="${CERTBOT_EMAIL:-admin@micss-lab.be}"
COMPOSE_FILE="docker-compose.prod.yml"

echo "==> Creating dummy certificate for $DOMAIN so nginx can start..."
mkdir -p ./certbot/conf/live/$DOMAIN
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout ./certbot/conf/live/$DOMAIN/privkey.pem \
  -out ./certbot/conf/live/$DOMAIN/fullchain.pem \
  -subj "/CN=$DOMAIN"

echo "==> Starting nginx with dummy cert..."
docker compose -f $COMPOSE_FILE up -d frontend

echo "==> Requesting real certificate from Let's Encrypt..."
docker compose -f $COMPOSE_FILE run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --domain "$DOMAIN" \
  --domain "www.$DOMAIN" \
  --agree-tos \
  --no-eff-email \
  --force-renewal

echo "==> Reloading nginx with real certificate..."
docker compose -f $COMPOSE_FILE exec frontend nginx -s reload

echo "==> Done! SSL is active for $DOMAIN"
