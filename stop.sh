#!/bin/bash

# SnapifY Stop Script
# This script fully stops the SnapifY webapp

set -e  # Exit on any error

echo "🛑 Stopping SnapifY webapp..."

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

# Allow running as root or regular user

# Stop PM2 application
print_status "Stopping PM2 application..."
pm2 stop snapify 2>/dev/null || print_warning "PM2 app 'snapify' not running or already stopped"
pm2 delete snapify 2>/dev/null || print_warning "PM2 app 'snapify' not found or already deleted"

# Save PM2 configuration
pm2 save 2>/dev/null || true

# Stop nginx if running
if sudo systemctl is-active --quiet nginx; then
    print_status "Stopping nginx..."
    sudo systemctl stop nginx
else
    print_warning "nginx is not running"
fi

# Kill any remaining Node.js processes on port 3001
print_status "Checking for remaining processes on port 3001..."
if lsof -ti:3001 > /dev/null 2>&1; then
    print_status "Killing processes on port 3001..."
    sudo kill -9 $(lsof -ti:3001) 2>/dev/null || true
else
    print_warning "No processes found on port 3001"
fi

# Display status
print_status "📊 Current PM2 Status:"
pm2 list

print_status "✅ SnapifY webapp stopped successfully!"
print_status ""
print_status "To start again, run: ./deploy.sh"