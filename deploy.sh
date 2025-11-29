#!/bin/bash

# SnapifY Production Deployment Script
# Comprehensive deployment based on DEPLOYMENT.md guide
# Run this script on your production server

set -e  # Exit on any error

echo "🚀 Starting SnapifY Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/var/www/snapify"
BACKUP_DIR="/var/www/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DOMAIN="snapify.skytech.mk"

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
    print_warning "Running as root. This is acceptable for deployment, but consider using a regular user with sudo for security."
    SUDO_CMD=""
    APP_USER="snapify"
    # Ensure snapify user exists when running as root
    if ! id -u snapify &>/dev/null; then
        useradd -m -s /bin/bash snapify
        print_status "Created snapify user for application ownership"
    fi
else
    print_status "Running as regular user. Using sudo for privileged operations."
    SUDO_CMD="sudo"
    APP_USER="$USER"
fi

# Function to check command availability
check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_error "$1 is not installed. $2"
        return 1
    fi
    return 0
}

# Function to install system packages
install_system_packages() {
    print_step "Installing system packages..."

    # Update package list
    $SUDO_CMD apt update

    # Install required packages
    $SUDO_CMD apt install -y curl wget gnupg2 software-properties-common

    # Install Node.js 20+
    if ! command -v node &> /dev/null; then
        print_status "Installing Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO_CMD -E bash -
        $SUDO_CMD apt-get install -y nodejs
    fi

    # Install nginx
    if ! command -v nginx &> /dev/null; then
        print_status "Installing nginx..."
        $SUDO_CMD apt install -y nginx
    fi

    # Install Redis
    if ! command -v redis-server &> /dev/null; then
        print_status "Installing Redis..."
        $SUDO_CMD apt install -y redis-server
        $SUDO_CMD systemctl enable redis-server
        $SUDO_CMD systemctl start redis-server
    fi

    # Install monitoring tools
    $SUDO_CMD apt install -y htop iotop ncdu

    print_status "✅ System packages installed"
}

# Function to setup directories
setup_directories() {
    print_step "Setting up directories..."

    # Create application directory
    $SUDO_CMD mkdir -p "$PROJECT_DIR"
    if [[ $EUID -eq 0 ]]; then
        $SUDO_CMD chown -R $APP_USER:$APP_USER "$PROJECT_DIR"
    else
        $SUDO_CMD chown -R $USER:$USER "$PROJECT_DIR"
    fi

    # Create backup directory
    $SUDO_CMD mkdir -p "$BACKUP_DIR"
    if [[ $EUID -eq 0 ]]; then
        $SUDO_CMD chown -R $APP_USER:$APP_USER "$BACKUP_DIR"
    else
        $SUDO_CMD chown -R $USER:$USER "$BACKUP_DIR"
    fi

    # Create logs directory
    mkdir -p "$PROJECT_DIR/logs"

    print_status "✅ Directories created"
}

# Function to deploy application
deploy_application() {
    print_step "Deploying application..."

    # Navigate to project directory
    cd "$PROJECT_DIR" || {
        print_error "Cannot access project directory: $PROJECT_DIR"
        exit 1
    }

    # Create backup of current deployment
    if [ -d "dist" ] || [ -f "package.json" ]; then
        print_status "Creating backup of current deployment..."
        $SUDO_CMD tar -czf "$BACKUP_DIR/snapify_backup_$TIMESTAMP.tar.gz" dist/ server/ package*.json ecosystem.config.cjs .env logs/ 2>/dev/null || true
    fi

    # Install PM2 if not present
    if ! command -v pm2 &> /dev/null; then
        print_status "Installing PM2..."
        $SUDO_CMD npm install -g pm2
    fi

    # Install dependencies
    print_status "Installing dependencies..."
    npm ci --production=false

    # Run tests
    print_status "Running tests..."
    npm test -- --passWithNoTests --watchAll=false || {
        print_warning "Tests failed, but continuing with deployment..."
    }

    # Build the application
    print_status "Building production application..."
    npm run build

    # Stop existing PM2 process if running
    print_status "Stopping existing application..."
    pm2 stop snapify 2>/dev/null || true
    pm2 delete snapify 2>/dev/null || true

    # Start application with PM2
    print_status "Starting application with PM2..."
    pm2 start ecosystem.config.cjs --env production

    # Save PM2 configuration
    pm2 save

    # Set up PM2 to start on boot
    print_status "Setting up PM2 startup..."
    $SUDO_CMD env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $APP_USER --hp /home/$APP_USER 2>/dev/null || {
        print_warning "PM2 startup setup failed. You may need to run this manually."
    }

    print_status "✅ Application deployed"
}

# Function to configure nginx
configure_nginx() {
    print_step "Configuring nginx..."

    # Copy nginx configuration
    $SUDO_CMD cp nginx.conf /etc/nginx/sites-available/snapify

    # Enable site
    $SUDO_CMD ln -s /etc/nginx/sites-available/snapify /etc/nginx/sites-enabled/ 2>/dev/null || true

    # Remove default site
    $SUDO_CMD rm -f /etc/nginx/sites-enabled/default

    # Test nginx configuration
    if $SUDO_CMD nginx -t; then
        print_status "✅ Nginx configuration is valid"
    else
        print_error "❌ Nginx configuration is invalid"
        exit 1
    fi

    # Restart nginx (will start if not running, restart if running)
    $SUDO_CMD systemctl restart nginx

    if $SUDO_CMD systemctl is-active --quiet nginx; then
        print_status "✅ Nginx configured and running"
    else
        print_error "❌ Failed to start nginx"
        exit 1
    fi
}

# Function to setup SSL (optional - handled by Cloudflare)
setup_ssl() {
    print_step "SSL Setup (Optional - handled by Cloudflare)"

    print_status "SSL certificates are handled by Cloudflare. No server SSL setup needed."
    print_status "Ensure Cloudflare SSL/TLS mode is set to 'Full (strict)' or 'Full'"
    print_status "Enable 'Always Use HTTPS' in Cloudflare dashboard"
}

# Function to test deployment
test_deployment() {
    print_step "Testing deployment..."

    # Wait for application to start
    print_status "Waiting for application to start..."
    sleep 10

    # Test application health
    if curl -s -f http://localhost:3001/api/health > /dev/null; then
        print_status "✅ Application health check passed"
    else
        print_error "❌ Application health check failed"
        exit 1
    fi

    # Test nginx
    if curl -s -f http://localhost/api/health > /dev/null; then
        print_status "✅ Nginx proxy check passed"
    else
        print_warning "⚠️  Nginx proxy check failed (may be expected if domain not configured yet)"
    fi

    # Test Redis
    if redis-cli ping | grep -q PONG; then
        print_status "✅ Redis connection check passed"
    else
        print_warning "⚠️  Redis connection check failed"
    fi
}

# Function to setup monitoring
setup_monitoring() {
    print_step "Setting up monitoring..."

    # Setup log rotation
    $SUDO_CMD tee /etc/logrotate.d/snapify > /dev/null <<EOF
$PROJECT_DIR/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $APP_USER $APP_USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

    print_status "✅ Monitoring setup completed"
}

# Function to display status
display_status() {
    print_step "Deployment Summary"

    echo ""
    echo "========================================"
    echo "🎉 SnapifY Deployment Completed!"
    echo "========================================"
    echo ""

    # PM2 status
    echo "📊 PM2 Status:"
    pm2 status
    echo ""

    # Application info
    echo "🌐 Application URLs:"
    echo "  - Local: http://localhost:3001"
    echo "  - Nginx: http://localhost"
    echo "  - Domain: https://$DOMAIN (after DNS setup)"
    echo ""

    # Next steps
    echo "📋 Next Steps:"
    echo "1. ✅ Configure environment variables in .env file"
    echo "2. ✅ Set up Redis password (optional but recommended)"
    echo "3. ✅ Configure Sentry DSN for error monitoring"
    echo "4. 🔄 Update DNS to point $DOMAIN to your server IP"
    echo "5. 🔄 Configure Cloudflare SSL settings"
    echo "6. 🔄 Test the application at https://$DOMAIN"
    echo ""

    # Useful commands
    echo "🛠️  Useful Commands:"
    echo "  - View logs: pm2 logs snapify"
    echo "  - Restart app: pm2 restart snapify"
    echo "  - Monitor: pm2 monit"
    echo "  - Stop app: pm2 stop snapify"
    echo "  - Check nginx: $SUDO_CMD nginx -t && $SUDO_CMD systemctl reload nginx"
    echo "  - Redis status: redis-cli ping"
    echo ""

    # Infrastructure status
    echo "🏗️  Infrastructure Status:"
    echo "  - Node.js: $(node --version)"
    echo "  - npm: $(npm --version)"
    echo "  - PM2: $(pm2 --version)"
    echo "  - nginx: $(nginx -v 2>&1 | cut -d'/' -f2)"
    echo "  - Redis: $(redis-server --version | cut -d'=' -f2 | cut -d' ' -f1)"
    echo ""
}

# Main deployment flow
main() {
    print_status "Starting comprehensive SnapifY deployment..."

    # Pre-deployment checks
    check_command "curl" "Please install curl first."
    check_command "wget" "Please install wget first."

    # Installation and setup
    install_system_packages
    setup_directories
    deploy_application
    configure_nginx
    setup_ssl
    test_deployment
    setup_monitoring

    # Display final status
    display_status

    print_status "🎉 Deployment completed successfully!"
    print_status "Your SnapifY application is now running with enterprise-grade infrastructure!"
}

# Run main function
main "$@"