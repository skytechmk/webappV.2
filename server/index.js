import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { initDb } from './config/db.js';
import { initSocket } from './services/socket.js';
import { apiGateway } from './services/apiGateway.js';
import { logger } from './services/loggerService.js';
import { monitoring } from './services/monitoringService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database
initDb();

// Get the Express app from API Gateway
const app = apiGateway.getApp();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Trust proxy - required when behind nginx
app.set('trust proxy', true);

// Admin Reset (Dev Only) - Add this to the gateway
app.post('/api/admin/reset', async (req, res) => {
    const { authenticateToken } = await import('./controllers/authController.js');
    authenticateToken(req, res, async () => {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Unauthorized" });
        if (config.NODE_ENV === 'production') {
            return res.status(403).json({ error: "System reset is disabled in production." });
        }
        // ... (Reset logic would go here, omitted for brevity as it's dev-only)
        res.json({ success: true, message: "Reset functionality is currently disabled in refactored version." });
    });
});

// Start Server
server.listen(config.PORT, () => {
    logger.info(`Server running on port ${config.PORT}`, {
        port: config.PORT,
        environment: config.NODE_ENV,
        redisEnabled: !!process.env.REDIS_HOST,
        sentryEnabled: !!config.SENTRY_DSN
    });
});