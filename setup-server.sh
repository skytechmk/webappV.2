#!/bin/bash

# SnapifY Server Setup Script
# Prepares a fresh Ubuntu server for SnapifY deployment
# Run this script on a fresh Ubuntu server before running deploy.sh

set -e  # Exit on any error

echo "🚀 Starting SnapifY Server Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    print_warning "Running as root. This is acceptable for server setup, but consider using a regular user with sudo for security."
    SUDO_CMD=""
else
    print_status "Running as regular user. Using sudo for privileged operations."
    SUDO_CMD="sudo"
fi

# Update system
print_step "Updating system packages..."
$SUDO_CMD apt update && $SUDO_CMD apt upgrade -y

# Install essential packages
print_step "Installing essential packages..."
$SUDO_CMD apt install -y curl wget gnupg2 software-properties-common ufw htop iotop ncdu

# Install Node.js 20+
print_step "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO_CMD -E bash -
$SUDO_CMD apt-get install -y nodejs

# Verify Node.js installation
print_status "Node.js version: $(node --version)"
print_status "npm version: $(npm --version)"

# Install nginx
print_step "Installing nginx..."
$SUDO_CMD apt install -y nginx

# Install Redis
print_step "Installing Redis..."
$SUDO_CMD apt install -y redis-server
$SUDO_CMD systemctl enable redis-server
$SUDO_CMD systemctl start redis-server

# Install PM2
print_step "Installing PM2..."
$SUDO_CMD npm install -g pm2

# Setup firewall (basic)
print_step "Configuring firewall..."
$SUDO_CMD ufw allow ssh
$SUDO_CMD ufw allow 'Nginx Full'
$SUDO_CMD ufw --force enable

# Create application directory
print_step "Creating application directory..."
$SUDO_CMD mkdir -p /var/www/snapify
$SUDO_CMD mkdir -p /var/www/backups
if [[ $EUID -eq 0 ]]; then
    # Running as root, create a snapify user
    if ! id -u snapify &>/dev/null; then
        $SUDO_CMD useradd -m -s /bin/bash snapify
        print_status "Created snapify user for application ownership"
    fi
    $SUDO_CMD chown -R snapify:snapify /var/www/snapify
    $SUDO_CMD chown -R snapify:snapify /var/www/backups
else
    $SUDO_CMD chown -R $USER:$USER /var/www/snapify
    $SUDO_CMD chown -R $USER:$USER /var/www/backups
fi

# Setup log rotation
print_step "Setting up log rotation..."
$SUDO_CMD tee /etc/logrotate.d/snapify > /dev/null <<EOF
/var/www/snapify/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reloadLogs 2>/dev/null || true
    endscript
}
EOF

# Display status
print_step "Server Setup Complete!"

echo ""
echo "========================================"
echo "✅ Server Setup Completed Successfully!"
echo "========================================"
echo ""

echo "📊 Installed Components:"
echo "  - Ubuntu packages: curl, wget, ufw, htop, iotop, ncdu"
echo "  - Node.js: $(node --version)"
echo "  - npm: $(npm --version)"
echo "  - nginx: $(nginx -v 2>&1 | cut -d'/' -f2)"
echo "  - Redis: $(redis-server --version | cut -d'=' -f2 | cut -d' ' -f1)"
echo "  - PM2: $(pm2 --version)"
echo ""

echo "📁 Created Directories:"
echo "  - /var/www/snapify (application)"
echo "  - /var/www/backups (backups)"
echo "  - /var/www/snapify/logs (logs)"
echo ""

echo "🔥 Firewall Status:"
sudo ufw status
echo ""

echo "🚀 Next Steps:"
echo "1. Clone your SnapifY repository to /var/www/snapify"
echo "2. Configure environment variables (.env file)"
echo "3. Run ./deploy.sh to deploy the application"
echo ""

echo "🛠️  Useful Commands:"
echo "  - Check services: sudo systemctl status nginx redis-server"
echo "  - Firewall: sudo ufw status"
echo "  - Redis: redis-cli ping"
echo "  - PM2: pm2 status"
echo ""

print_status "🎉 Server is ready for SnapifY deployment!"