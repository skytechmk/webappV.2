#!/bin/bash

# SnapifY Full Restart Script
# This script performs a complete restart of the SnapifY webapp including:
# - Stopping current deployment
# - Clearing caches and temporary files
# - Restarting nginx
# - Starting fresh deployment
# - Health checks

set -e  # Exit on any error

echo "🔄 Performing full restart of SnapifY webapp..."

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check service health
check_health() {
    local url=$1
    local timeout=30
    local count=0

    print_status "Checking health at $url..."
    while [ $count -lt $timeout ]; do
        if curl -s --head --fail "$url" > /dev/null 2>&1; then
            print_status "✅ Health check passed for $url"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done

    print_error "❌ Health check failed for $url after ${timeout}s"
    return 1
}

# Step 1: Stop the current deployment
print_step "1/7: Stopping current deployment..."
if [ -f "./stop.sh" ]; then
    ./stop.sh
    print_status "✅ Current deployment stopped"
else
    print_error "stop.sh not found in current directory"
    exit 1
fi

# Brief pause to ensure everything is stopped
sleep 3

# Step 2: Clear system caches and temporary files
print_step "2/7: Clearing caches and temporary files..."

# Clear Node.js cache if it exists
if [ -d "node_modules/.cache" ]; then
    print_status "Clearing Node.js cache..."
    rm -rf node_modules/.cache
fi

# Clear any lingering PM2 logs (optional - PM2 handles this)
if command_exists pm2; then
    print_status "Clearing old PM2 logs..."
    pm2 flush snapify 2>/dev/null || true
fi

# Clear any temporary files in uploads (be careful with this)
if [ -d "server/uploads/temp" ]; then
    print_status "Clearing temporary upload files..."
    find server/uploads/temp -type f -mtime +1 -delete 2>/dev/null || true
fi

print_status "✅ Caches and temporary files cleared"

# Step 3: Restart nginx to pick up any config changes
print_step "3/7: Restarting nginx..."
if command_exists systemctl; then
    sudo systemctl restart nginx
    if systemctl is-active --quiet nginx; then
        print_status "✅ Nginx restarted via systemctl"
    else
        print_error "❌ Failed to start nginx via systemctl"
        exit 1
    fi
elif command_exists service; then
    sudo service nginx restart
    print_status "✅ Nginx restarted via service"
else
    print_warning "Could not restart nginx - systemctl/service not available"
fi

# Step 4: Clear browser cache hint (for development)
print_step "4/7: Preparing for fresh start..."
print_status "💡 Tip: Hard refresh (Ctrl+F5) in browser to clear client cache"

# Step 5: Start fresh deployment
print_step "5/7: Starting fresh deployment..."
if [ -f "./deploy.sh" ]; then
    ./deploy.sh
    print_status "✅ Fresh deployment started"
else
    print_error "deploy.sh not found in current directory"
    exit 1
fi

# Step 6: Wait for services to be ready
print_step "6/7: Waiting for services to initialize..."
sleep 5

# Step 7: Health checks
print_step "7/7: Performing health checks..."

# Check main application
if check_health "https://snapify.skytech.mk"; then
    print_status "✅ Frontend health check passed"
else
    print_warning "⚠️  Frontend health check failed - service may still be starting"
fi

# Check API
if check_health "https://snapify.skytech.mk/api/health"; then
    print_status "✅ API health check passed"
else
    print_warning "⚠️  API health check failed - service may still be starting"
fi

# Check PM2 status
if command_exists pm2; then
    if pm2 describe snapify > /dev/null 2>&1; then
        print_status "✅ PM2 process 'snapify' is running"
    else
        print_error "❌ PM2 process 'snapify' is not running"
        exit 1
    fi
fi

print_status ""
print_status "🎉 SnapifY webapp full restart completed successfully!"
print_status ""
print_status "📊 Service Status:"
echo "   🌐 Frontend: https://snapify.skytech.mk"
echo "   🔌 API: https://snapify.skytech.mk/api/health"
echo "   📱 PM2 Process: snapify"
print_status ""
print_status "💡 Next steps:"
echo "   • Check application logs: pm2 logs snapify"
echo "   • Monitor performance: pm2 monit"
echo "   • View PM2 status: pm2 status"
print_status ""
print_status "✅ Full restart process completed!"