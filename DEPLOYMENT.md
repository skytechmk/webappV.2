# SnapifY Production Deployment Guide

## 🚀 Quick Start

1. **Clone and setup:**
   ```bash
   git clone <your-repo> /var/www/snapify
   cd /var/www/snapify
   npm ci
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env  # Edit with production values
   ```

3. **Deploy:**
   ```bash
   ./deploy.sh
   ```

4. **Configure nginx:**
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/snapify
   sudo ln -s /etc/nginx/sites-available/snapify /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

5. **SSL Setup:** Handled automatically by Cloudflare - no action needed

## 📋 Prerequisites

### Server Requirements
- **Ubuntu 20.04+** or similar Linux distribution
- **Node.js 20+** and **npm**
- **Redis** (recommended for caching)
- **PM2** process manager
- **nginx** web server
- **SSL certificate** (handled by Cloudflare - no server setup needed)
- **Domain name** pointing to server (via Cloudflare)

### Infrastructure Setup

#### Redis Installation (Recommended)

```bash
# Install Redis
sudo apt update
sudo apt install redis-server -y

# Configure Redis (optional - for security)
sudo nano /etc/redis/redis.conf
# Set: supervised systemd
# Set: requirepass your_secure_password

# Start and enable Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test Redis connection
redis-cli ping
```

#### Sentry Setup (Error Monitoring)

1. Create account at [sentry.io](https://sentry.io)
2. Create new project for Snapify
3. Get your DSN from project settings
4. Add DSN to environment variables

### External Services
- **Redis server** (recommended for caching, optional but improves performance)
- **Sentry account** (for error monitoring and alerting)
- **MinIO server** running and accessible
- **Google OAuth** credentials
- **Gemini AI API** key
- **Ollama server** (optional, for local AI)

## ⚙️ Environment Configuration

### Critical Production Variables

```bash
# --- SECURITY (CHANGE THESE!) ---
JWT_SECRET=your_strong_random_secret_here_minimum_64_chars
ADMIN_PASSWORD=your_secure_admin_password
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key

# --- INFRASTRUCTURE (NEW) ---
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
SENTRY_DSN=https://your-sentry-dsn-here@sentry.io/project-id

# --- CORS & DOMAINS ---
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id

# --- EXTERNAL SERVICES ---
GEMINI_API_KEY=your_gemini_api_key
S3_ENDPOINT=https://your-minio-server.com
S3_ACCESS_KEY=your_minio_access_key
S3_SECRET_KEY=your_minio_secret_key
```

### Environment File Structure

```bash
# .env (Production)
NODE_ENV=production
PORT=3001
VITE_API_URL=  # Leave empty for relative URLs

# Database & Storage
S3_ENDPOINT=https://minio.yourdomain.com
S3_BUCKET_NAME=snapify-media

# Security
JWT_SECRET=CHANGE_THIS_IN_PRODUCTION...
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=SECURE_PASSWORD_HERE

# AI Services
GEMINI_API_KEY=your_api_key
OLLAMA_URL=http://localhost:11434

# Push Notifications
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
```

## 🏗️ Deployment Steps

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install nginx
sudo apt install nginx -y

# Install PM2 globally
sudo npm install -g pm2

# Create application directory
sudo mkdir -p /var/www/snapify
sudo chown -R $USER:$USER /var/www/snapify
```

### 2. Application Deployment

```bash
# Navigate to application directory
cd /var/www/snapify

# Clone your repository
git clone https://github.com/yourusername/snapify.git .

# Install dependencies
npm ci --production=false

# Configure environment
cp .env.example .env
nano .env  # Edit with production values

# Build application
npm run build

# Run deployment script
./deploy.sh
```

### 3. Nginx Configuration

```bash
# Copy nginx configuration
sudo cp nginx.conf /etc/nginx/sites-available/snapify

# Enable site
sudo ln -s /etc/nginx/sites-available/snapify /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 4. SSL Certificate Setup (Optional - Handled by Cloudflare)

Since this application uses Cloudflare for SSL termination, SSL certificates are managed automatically by Cloudflare. No additional SSL setup is required on the server.

**Cloudflare SSL Settings:**
- Ensure SSL/TLS encryption mode is set to "Full (strict)" or "Full"
- Enable "Always Use HTTPS"
- Configure SSL certificates in Cloudflare dashboard

If you prefer to handle SSL directly on the server (not recommended with Cloudflare), you can use Let's Encrypt:

```bash
# Install Certbot
sudo apt install snapd -y
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Get SSL certificate (only if not using Cloudflare)
sudo certbot --nginx -d yourdomain.com

# Test renewal
sudo certbot renew --dry-run
```

### 5. DNS Configuration

Update your DNS records:
- **A Record:** `snapify.skytech.mk` → `YOUR_SERVER_IP`
- **AAAA Record:** (optional, for IPv6)

## 🔍 Testing & Verification

### Health Checks

```bash
# Test application health
curl -f https://snapify.skytech.mk/health

# Test API endpoints
curl -f https://snapify.skytech.mk/api/health

# Test admin login
curl -X POST https://snapify.skytech.mk/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@skytech.mk","password":"your_password"}'
```

### Application Testing

1. **Run Test Suite:**
   ```bash
   npm test
   npm run test:coverage
   ```

2. **Frontend Access:** https://snapify.skytech.mk
3. **Admin Login:** Use configured admin credentials
4. **Create Event:** Test event creation
5. **Upload Media:** Test file uploads
6. **System Dashboard:** Check storage monitoring
7. **Cache Performance:** Verify Redis caching is working
8. **Error Monitoring:** Check Sentry dashboard for any errors

## 📊 Monitoring & Maintenance

### PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs snapify

# Monitor resources
pm2 monit

# Restart application
pm2 restart snapify

# Reload without downtime
pm2 reload snapify
```

### Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

### Application Logs

```bash
# Application logs (Winston structured logging)
tail -f /var/www/snapify/logs/combined.log

# Error logs
tail -f /var/www/snapify/logs/error.log

# HTTP request logs
tail -f /var/www/snapify/logs/combined.log | grep "HTTP"

# Cache performance logs
tail -f /var/www/snapify/logs/combined.log | grep "cache"
```

### Error Monitoring (Sentry)

- **Dashboard:** Access your Sentry project dashboard
- **Real-time Alerts:** Configure alerts for error spikes
- **Performance Monitoring:** Track API response times
- **Release Tracking:** Monitor deployment impact

### Cache Monitoring

```bash
# Check Redis status
redis-cli info | grep connected_clients

# Monitor cache hit rates (check application logs)
tail -f /var/www/snapify/logs/combined.log | grep -E "(cache|Cache)"
```

## 🔧 Troubleshooting

### Common Issues

**Application won't start:**
```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs snapify

# Check environment variables
pm2 show snapify
```

**nginx errors:**
```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Restart nginx
sudo systemctl restart nginx
```

**SSL issues:**
```bash
# Check certificate status
sudo certbot certificates

# Renew certificates
sudo certbot renew
```

**Database issues:**
```bash
# Check SQLite file
ls -la /var/www/snapify/snapify.db

# Backup database
cp /var/www/snapify/snapify.db /var/www/backups/snapify_$(date +%Y%m%d).db
```

## 🔄 Updates & Rollbacks

### Application Updates

```bash
cd /var/www/snapify

# Pull latest changes
git pull origin main

# Install new dependencies
npm ci

# Build application
npm run build

# Restart with PM2
pm2 restart snapify
```

### Rollback Procedure

```bash
cd /var/www/snapify

# Stop application
pm2 stop snapify

# Restore from backup
cp /var/www/backups/snapify_backup_20231201.tar.gz .
tar -xzf snapify_backup_20231201.tar.gz

# Restart application
pm2 start snapify
```

## 📈 Performance Optimization

### Server Tuning

```bash
# Increase file limits
echo "fs.file-max = 65536" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Optimize nginx worker processes
sudo sed -i 's/worker_processes auto;/worker_processes 2;/' /etc/nginx/nginx.conf
sudo systemctl reload nginx
```

### Application Optimization

```bash
# Enable gzip compression (already configured in nginx.conf)
# Optimize images automatically
# Use CDN for static assets (optional)
```

## 🔒 Security Checklist

- [ ] **Firewall configured** (UFW/iptables)
- [ ] **SSH key authentication only**
- [ ] **Fail2ban installed** for brute force protection
- [ ] **Regular security updates** (`sudo apt update && sudo apt upgrade`)
- [ ] **SSL/TLS configured** with strong ciphers
- [ ] **Environment variables secured**
- [ ] **Database backups encrypted**
- [ ] **API rate limiting active**

## 📞 Support & Monitoring

### Monitoring Setup

```bash
# Install monitoring tools (optional)
sudo apt install htop iotop ncdu -y

# Set up log rotation
sudo nano /etc/logrotate.d/snapify
```

### Backup Strategy

```bash
# Create backup script
cat > /var/www/snapify/backup.sh << 'EOF'
#!/bin/bash
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/www/backups"

# Database backup
sqlite3 /var/www/snapify/snapify.db ".backup '${BACKUP_DIR}/snapify_db_${TIMESTAMP}.db'"

# Application backup
tar -czf "${BACKUP_DIR}/snapify_app_${TIMESTAMP}.tar.gz" -C /var/www snapify/

# Clean old backups (keep last 7 days)
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
EOF

chmod +x /var/www/snapify/backup.sh

# Add to crontab for daily backups
echo "0 2 * * * /var/www/snapify/backup.sh" | crontab -
```

## 🎯 Success Metrics

After deployment, monitor these KPIs:

- **Response Time:** < 2 seconds for API calls
- **Uptime:** > 99.5%
- **Error Rate:** < 1%
- **Storage Usage:** Monitor growth trends
- **User Engagement:** Track active users and events

## 📝 Final Notes

- **Regular Backups:** Test backup restoration quarterly
- **Security Audits:** Review logs monthly for suspicious activity
- **Performance Monitoring:** Set up alerts for high resource usage
- **Documentation:** Keep this guide updated with any changes

---

**Deployment completed successfully!** 🎉

Your SnapifY application is now live and ready to serve clients at `https://snapify.skytech.mk`