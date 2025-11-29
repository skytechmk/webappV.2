// API Gateway - Central routing and middleware management
import express from 'express';
import cors from 'cors';
import { authenticateToken } from '../controllers/authController.js';
import { config } from '../config/env.js';
import { logger } from './loggerService.js';
import { monitoring } from './monitoringService.js';

class ApiGateway {
    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Basic security headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            next();
        });

        // CORS configuration - allow all origins for shared events
        this.app.use('/api/events/:id', cors({
            origin: true, // Allow all origins for shared events
            credentials: false, // No credentials needed for public events
            methods: ['GET', 'OPTIONS'],
            allowedHeaders: ['Content-Type']
        }));

        // Standard CORS for other routes
        this.app.use(cors({
            origin: config.ALLOWED_ORIGINS || ['http://localhost:3000', 'http://localhost:5173'],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Basic rate limiting (simple implementation)
        const requestCounts = new Map();
        this.app.use('/api/', (req, res, next) => {
            const ip = req.ip;
            const now = Date.now();
            const windowMs = 15 * 60 * 1000; // 15 minutes

            if (!requestCounts.has(ip)) {
                requestCounts.set(ip, []);
            }

            const requests = requestCounts.get(ip);
            // Clean old requests
            const validRequests = requests.filter(time => now - time < windowMs);
            requestCounts.set(ip, validRequests);

            if (validRequests.length >= 100) {
                return res.status(429).json({ error: 'Too many requests from this IP, please try again later.' });
            }

            validRequests.push(now);
            next();
        });
    }

    setupRoutes() {
        // Health check (no auth required)
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // Public proxy endpoint
        this.app.get('/api/proxy-media', async (req, res) => {
            const { key } = req.query;
            if (!key || typeof key !== 'string') {
                return res.status(400).send("Missing key");
            }

            try {
                const { getS3Object } = await import('./storage.js');
                const { Body, ContentType } = await getS3Object(key);
                if (ContentType) res.setHeader('Content-Type', ContentType);
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                Body.pipe(res);
            } catch (e) {
                res.status(404).send("Not Found");
            }
        });

        // Dynamic route loading
        this.setupDynamicRoutes();
    }

    async setupDynamicRoutes() {
        try {
            // Auth routes (public)
            const authRoutes = await import('../routes/authRoutes.js');
            this.app.use('/api/auth', authRoutes.default);

            // Event routes (individual routes handle their own auth)
            const eventRoutes = await import('../routes/eventRoutes.js');
            this.app.use('/api/events', eventRoutes.default);

            // Media routes (protected)
            const mediaRoutes = await import('../routes/mediaRoutes.js');
            this.app.use('/api/media', authenticateToken, mediaRoutes.default);

            // User routes (protected)
            const userRoutes = await import('../routes/userRoutes.js');
            this.app.use('/api/users', authenticateToken, userRoutes.default);

            // AI routes (protected)
            const aiRoutes = await import('../routes/aiRoutes.js');
            this.app.use('/api/ai', authenticateToken, aiRoutes.default);

            // Admin routes (admin only)
            const adminRoutes = await import('../routes/adminRoutes.js');
            this.app.use('/api/admin', authenticateToken, adminRoutes.default);

            // System routes (admin only)
            const systemRoutes = await import('../routes/systemRoutes.js');
            this.app.use('/api/system', authenticateToken, systemRoutes.default);

        } catch (error) {
            logger.error('Error loading routes:', { error: error.message, stack: error.stack });
            monitoring.captureException(error, { type: 'route_loading' });
        }
    }

    // Request logging middleware
    setupLogging() {
        this.app.use(logger.requestLogger());
    }

    // Error handling middleware
    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            logger.warn('Route not found', {
                method: req.method,
                url: req.originalUrl,
                ip: req.ip
            });
            res.status(404).json({ error: 'Route not found' });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            logger.error('Unhandled error:', {
                error: error.message,
                stack: error.stack,
                method: req.method,
                url: req.originalUrl,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            // Capture error with Sentry
            monitoring.captureException(error, {
                type: 'unhandled_error',
                url: req.originalUrl,
                method: req.method,
                userId: req.user?.id
            });

            // Don't leak error details in production
            const isDevelopment = config.NODE_ENV !== 'production';
            const errorResponse = {
                error: isDevelopment ? error.message : 'Internal server error',
                ...(isDevelopment && { stack: error.stack })
            };

            res.status(500).json(errorResponse);
        });
    }

    // Service discovery (for future microservices)
    async discoverServices() {
        // This would discover available services in a microservices architecture
        // For now, return local services
        return {
            auth: 'local',
            media: 'local',
            events: 'local',
            users: 'local'
        };
    }

    // Circuit breaker pattern (for future use)
    async callService(serviceName, endpoint, options = {}) {
        const startTime = Date.now();
        try {
            // Implementation would go here
            logger.debug(`Service call: ${serviceName}/${endpoint}`, { options });
            return { success: true };
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`Service call failed: ${serviceName}/${endpoint}`, {
                error: error.message,
                duration,
                options
            });
            monitoring.captureException(error, {
                type: 'service_call_error',
                serviceName,
                endpoint,
                duration
            });
            throw error;
        }
    }

    // Get the Express app instance
    getApp() {
        return this.app;
    }

    // Start the gateway (if running standalone)
    async start(port = 3001) {
        this.setupLogging();
        this.setupErrorHandling();

        return new Promise((resolve) => {
            this.app.listen(port, () => {
                logger.info(`API Gateway running on port ${port}`, { port });
                resolve();
            });
        });
    }
}

export const apiGateway = new ApiGateway();
export default apiGateway;