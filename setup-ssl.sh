#!/bin/bash
DOMAIN="iwasfuckedbyrkn.xyz"

# Check if running as root (we need sudo for cp, but chown should be for the normal user)
if [ "$EUID" -eq 0 ]; then
  echo "Please run this script as your normal user (with sudo privileges), not as root."
  exit 1
fi

echo "Setting up SSL certificates for $DOMAIN..."

# Create local certs directory
mkdir -p certs

# Copy certificates (requires sudo)
echo "Copying certificates from /etc/letsencrypt..."
sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem certs/
sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem certs/

# Change ownership to the current user
echo "Fixing permissions..."
sudo chown -R $USER:$(id -gn) certs/
chmod 600 certs/privkey.pem
chmod 644 certs/fullchain.pem

echo "Done! Certificates are now in ./certs/ and accessible by the bot."
echo "You can now start the bot with: pm2 start ecosystem.config.js"
