#!/bin/bash

# SnapifY Restart Script
# This script stops the current deployment and starts a fresh one

set -e  # Exit on any error

echo "🔄 Restarting SnapifY webapp..."

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

# Step 1: Stop the current deployment
print_status "Step 1: Stopping current deployment..."
if [ -f "./stop.sh" ]; then
    ./stop.sh
else
    print_error "stop.sh not found in current directory"
    exit 1
fi

# Brief pause to ensure everything is stopped
sleep 2

# Step 2: Start fresh deployment
print_status "Step 2: Starting fresh deployment..."
if [ -f "./deploy.sh" ]; then
    ./deploy.sh
else
    print_error "deploy.sh not found in current directory"
    exit 1
fi

print_status "✅ SnapifY webapp restarted successfully!"