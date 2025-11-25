module.exports = {
  apps: [{
    name: 'snapify',
    script: 'server/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Environment variables will be loaded from .env file
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};