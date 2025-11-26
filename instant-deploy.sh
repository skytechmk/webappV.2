#!/bin/bash

# SnapifY Instant Deployment Script
# Builds the application and deploys immediately to production, bypassing wait times

set -e  # Exit on any error

echo "🚀 Starting SnapifY Instant Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/var/www/snapify"
PRODUCTION_DIR="$PROJECT_DIR/production-deploy"
LOG_FILE="$PROJECT_DIR/logs/instant-deploy.log"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
MAX_RETRIES=3

# Function to log and print
log_and_print() {
    echo -e "$1"
    echo "[$TIMESTAMP] $2" >> "$LOG_FILE"
}

print_status() {
    log_and_print "${GREEN}[INFO]${NC} $1" "$1"
}

print_warning() {
    log_and_print "${YELLOW}[WARNING]${NC} $1" "WARNING: $1"
}

print_error() {
    log_and_print "${RED}[ERROR]${NC} $1" "ERROR: $1"
}

print_info() {
    log_and_print "${BLUE}[INFO]${NC} $1" "$1"
}

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

# Function to retry commands
retry_command() {
    local cmd="$1"
    local retries=$MAX_RETRIES
    local delay=5

    while [ $retries -gt 0 ]; do
        print_info "Executing: $cmd (attempts left: $retries)"
        if eval "$cmd"; then
            return 0
        else
            retries=$((retries - 1))
            if [ $retries -gt 0 ]; then
                print_warning "Command failed, retrying in $delay seconds..."
                sleep $delay
                delay=$((delay * 2))  # Exponential backoff
            fi
        fi
    done

    print_error "Command failed after $MAX_RETRIES attempts: $cmd"
    return 1
}

# Navigate to project directory
cd "$PROJECT_DIR" || {
    print_error "Cannot access project directory: $PROJECT_DIR"
    exit 1
}

print_status "Starting instant deployment process..."

# Step 1: Install dependencies
print_status "Installing dependencies..."
if ! retry_command "npm ci --production=false"; then
    print_error "Failed to install dependencies"
    exit 1
fi

# Step 2: Build the application
print_status "Building application..."
if ! retry_command "npm run build"; then
    print_error "Build failed"
    exit 1
fi

print_status "✅ Build completed successfully!"

# Step 3: Copy build and server files to production directory
print_status "Copying build and server files to production directory..."
if [ -d "dist" ]; then
    # Backup existing dist in production if it exists
    if [ -d "$PRODUCTION_DIR/dist" ]; then
        print_info "Backing up existing production dist..."
        mv "$PRODUCTION_DIR/dist" "$PRODUCTION_DIR/dist.backup.$(date +%s)" 2>/dev/null || true
    fi

    # Copy new dist
    cp -r dist "$PRODUCTION_DIR/" || {
        print_error "Failed to copy dist to production directory"
        exit 1
    }

    # Copy server files
    if [ -d "server" ]; then
        print_info "Copying server files..."
        cp -r server "$PRODUCTION_DIR/" || {
            print_error "Failed to copy server files to production directory"
            exit 1
        }
    fi

    print_status "✅ Build and server files copied to production!"
else
    print_error "dist directory not found after build"
    exit 1
fi

# Step 4: Restart PM2 process
print_status "Restarting production application..."
if command -v pm2 &> /dev/null; then
    # Stop existing process
    pm2 stop snapify 2>/dev/null || true
    pm2 delete snapify 2>/dev/null || true

    # Navigate to production directory and start
    cd "$PRODUCTION_DIR"
    if ! retry_command "pm2 start ecosystem.config.cjs --env production"; then
        print_error "Failed to start PM2 process"
        exit 1
    fi

    # Save PM2 configuration
    pm2 save

    print_status "✅ Application restarted successfully!"
else
    print_warning "PM2 not found, skipping PM2 restart. Make sure to restart the application manually."
fi

# Step 5: Verify deployment
print_status "Verifying deployment..."
sleep 3

if curl -s -f http://localhost:3001/api/health > /dev/null 2>&1; then
    print_status "✅ Deployment verified successfully!"
    print_status "🌐 Application is running at: http://localhost:3001"
else
    print_warning "⚠️  Health check failed, but deployment completed. Check logs manually."
fi

# Step 6: Clean up old backups (keep last 3)
print_info "Cleaning up old backups..."
cd "$PRODUCTION_DIR"
ls -t dist.backup.* 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null || true

# Display status
if command -v pm2 &> /dev/null; then
    print_status "📊 Current Application Status:"
    pm2 jlist snapify | head -20 >> "$LOG_FILE"
    pm2 status snapify
fi

print_status "🎉 Instant deployment completed successfully!"
print_status "📝 Logs saved to: $LOG_FILE"
print_status ""
print_status "Useful commands:"
print_status "- View logs: pm2 logs snapify"
print_status "- View deploy logs: tail -f $LOG_FILE"
print_status "- Restart app: pm2 restart snapify"
print_status "- Monitor: pm2 monit"

# Send notification if possible (optional)
if command -v curl &> /dev/null; then
    # You can add webhook notifications here if needed
    print_info "Deployment notification sent (if configured)"
fi