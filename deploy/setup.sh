#!/bin/bash
# ============================================
# RV Sales CRM — VPS Deployment Script
# Run this on your IONOS Linux VPS as root
# ============================================

set -e

echo "=== 1. Installing Docker ==="
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker installed."
else
    echo "Docker already installed."
fi

echo ""
echo "=== 2. Installing Docker Compose ==="
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    apt-get update && apt-get install -y docker-compose-plugin
    echo "Docker Compose installed."
else
    echo "Docker Compose already installed."
fi

echo ""
echo "=== 3. Installing Nginx ==="
if ! command -v nginx &> /dev/null; then
    apt-get update && apt-get install -y nginx
    systemctl enable nginx
    echo "Nginx installed."
else
    echo "Nginx already installed."
fi

echo ""
echo "=== 4. Installing Certbot ==="
if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot python3-certbot-nginx
    echo "Certbot installed."
else
    echo "Certbot already installed."
fi

echo ""
echo "=== 5. Cloning the repo ==="
APP_DIR="/opt/rv-crm"
if [ ! -d "$APP_DIR" ]; then
    git clone https://github.com/LotLinkHQ/RV-Sales-Mini-CRM.git "$APP_DIR"
else
    echo "Repo already exists at $APP_DIR, pulling latest..."
    cd "$APP_DIR" && git pull
fi

echo ""
echo "=== 6. Setting up .env ==="
if [ ! -f "$APP_DIR/.env" ]; then
    echo "Creating .env file — YOU MUST EDIT THIS with your real values!"
    cat > "$APP_DIR/.env" << 'ENVFILE'
# Required for AI Assistant
ANTHROPIC_API_KEY=your-key-here

# Server
PORT=5000
NODE_ENV=production

# Optional — database (leave commented for demo/JSON mode)
# DATABASE_URL=postgresql://user:password@localhost:5432/rv_crm

# Optional — notifications
# SENDGRID_API_KEY=
# SENDGRID_FROM_EMAIL=
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_PHONE_NUMBER=
ENVFILE
    echo ""
    echo ">>> IMPORTANT: Edit $APP_DIR/.env with your real API keys! <<<"
    echo ">>> Run: nano $APP_DIR/.env <<<"
    echo ""
fi

echo ""
echo "=== 7. Setting up Nginx config ==="
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/lotlink.org
ln -sf /etc/nginx/sites-available/lotlink.org /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx config (will fail on SSL certs if not yet obtained, that's OK)
nginx -t 2>/dev/null && systemctl reload nginx || echo "Nginx config test failed — SSL certs needed first (step 9)"

echo ""
echo "=== 8. Building & starting the app ==="
cd "$APP_DIR"
docker compose up -d --build
echo "App is running on port 3000 internally."

echo ""
echo "=== 9. Getting SSL certificate ==="
echo "Before running this, make sure your DNS A record points to this server!"
echo ""
echo "Run this command manually when DNS is ready:"
echo "  certbot --nginx -d lotlink.org -d www.lotlink.org"
echo ""
echo "After SSL is set up, reload nginx:"
echo "  systemctl reload nginx"

echo ""
echo "============================================"
echo "DONE! Next steps:"
echo "1. Edit .env:  nano $APP_DIR/.env"
echo "2. Set DNS A record at IONOS to this server's IP"
echo "3. Run: certbot --nginx -d lotlink.org -d www.lotlink.org"
echo "4. Visit: https://lotlink.org"
echo "============================================"
