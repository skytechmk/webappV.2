#!/bin/bash

# SnapifY Production Deployment Script for Client Server
# Run this script on your production server after uploading the production-deploy folder

set -e  # Exit on any error

echo "🚀 Starting SnapifY Production Deployment for Client Service..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
   exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 is not installed. Installing PM2..."
    sudo npm install -g pm2
fi

# Install dependencies
print_status "Installing production dependencies..."
npm ci --production=false

# Create logs directory
print_status "Setting up logging..."
sudo mkdir -p logs
sudo chown -R $USER:$USER logs

# Stop existing PM2 process if running
print_status "Stopping existing application..."
pm2 stop snapify 2>/dev/null || true
pm2 delete snapify 2>/dev/null || true

# Start application with PM2
print_status "Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
print_status "Setting up PM2 startup..."
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || {
    print_warning "PM2 startup setup failed. You may need to run this manually."
}

# Wait for application to start
print_status "Waiting for application to start..."
sleep 5

# Test if application is running
if curl -s -f http://localhost:3001/api/health > /dev/null; then
    print_status "✅ Application started successfully!"
    print_status "🌐 Application is running at: http://localhost:3001"
else
    print_error "❌ Application failed to start. Check logs with: pm2 logs snapify"
    exit 1
fi

# Display status
print_status "📊 Application Status:"
pm2 status
pm2 monit

print_status "🎉 Production deployment completed successfully!"
print_status ""
print_status "Next steps for full production setup:"
print_status "1. Copy nginx.conf to /etc/nginx/sites-available/snapify"
print_status "2. Enable site: sudo ln -s /etc/nginx/sites-available/snapify /etc/nginx/sites-enabled/"
print_status "3. Test nginx: sudo nginx -t"
print_status "4. Reload nginx: sudo systemctl reload nginx"
print_status "5. Set up SSL certificate with Let's Encrypt:"
print_status "   sudo certbot --nginx -d snapify.skytech.mk"
print_status "6. Update DNS to point to your server IP"
print_status ""
print_status "Useful commands:"
print_status "- View logs: pm2 logs snapify"
print_status "- Restart app: pm2 restart snapify"
print_status "- Monitor: pm2 monit"
print_status "- Stop app: pm2 stop snapify"
print_status ""
print_status "🔒 Security reminders:"
print_status "- Change JWT_SECRET in .env to a strong random value"
print_status "- Update admin password in .env"
print_status "- Configure firewall to only allow necessary ports"
print_status "- Set up automated backups for the database"