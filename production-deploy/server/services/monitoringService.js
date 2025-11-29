// Error monitoring and performance tracking service using Sentry
import * as Sentry from '@sentry/node';
import { config } from '../config/env.js';
import { logger } from './loggerService.js';

class MonitoringService {
    constructor() {
        this.isInitialized = false;
        this.init();
    }

    init() {
        // Only initialize if DSN is provided
        if (!config.SENTRY_DSN) {
            logger.warn('Sentry DSN not configured, error monitoring disabled');
            return;
        }

        Sentry.init({
            dsn: config.SENTRY_DSN,
            environment: config.NODE_ENV || 'development',
            tracesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
            integrations: [
                // HTTP integration for automatic request monitoring
                Sentry.httpIntegration(),
                // GraphQL integration if needed
                // Sentry.graphqlIntegration(),
            ],
            beforeSend: (event, hint) => {
                // Filter out sensitive information
                if (event.request) {
                    // Remove sensitive headers
                    if (event.request.headers) {
                        delete event.request.headers.authorization;
                        delete event.request.headers['x-api-key'];
                    }

                    // Remove sensitive data from request body
                    if (event.request.data) {
                        const data = event.request.data;
                        if (typeof data === 'string' && data.includes('password')) {
                            event.request.data = '[FILTERED]';
                        }
                    }
                }

                logger.error('Error captured by Sentry', {
                    error: hint.originalException?.message,
                    sentryId: event.event_id
                });

                return event;
            }
        });

        this.isInitialized = true;
        logger.info('✅ Sentry error monitoring initialized');
    }

    // Capture exceptions
    captureException(error, context = {}) {
        if (!this.isInitialized) {
            logger.error('Sentry not initialized, cannot capture exception', { error: error.message });
            return;
        }

        Sentry.withScope((scope) => {
            // Add context information
            Object.keys(context).forEach(key => {
                scope.setTag(key, context[key]);
            });

            // Add user information if available
            if (context.userId) {
                scope.setUser({ id: context.userId });
            }

            // Add additional context
            if (context.tags) {
                Object.keys(context.tags).forEach(key => {
                    scope.setTag(key, context.tags[key]);
                });
            }

            if (context.extra) {
                Object.keys(context.extra).forEach(key => {
                    scope.setExtra(key, context.extra[key]);
                });
            }

            Sentry.captureException(error);
        });
    }

    // Capture messages
    captureMessage(message, level = 'info', context = {}) {
        if (!this.isInitialized) {
            logger.warn('Sentry not initialized, cannot capture message', { message });
            return;
        }

        Sentry.withScope((scope) => {
            // Set level
            scope.setLevel(level);

            // Add context
            Object.keys(context).forEach(key => {
                scope.setTag(key, context[key]);
            });

            Sentry.captureMessage(message);
        });
    }

    // Performance monitoring
    startTransaction(name, op) {
        if (!this.isInitialized) return null;

        return Sentry.startTransaction({
            name,
            op
        });
    }

    // Set user context
    setUser(user) {
        if (!this.isInitialized) return;

        Sentry.setUser(user);
    }

    // Add breadcrumb for debugging
    addBreadcrumb(message, category = 'custom', level = 'info', data = {}) {
        if (!this.isInitialized) return;

        Sentry.addBreadcrumb({
            message,
            category,
            level,
            data
        });
    }

    // Flush pending events (useful before app shutdown)
    async flush(timeout = 2000) {
        if (!this.isInitialized) return;

        return await Sentry.flush(timeout);
    }

    // Close the Sentry connection
    async close() {
        if (!this.isInitialized) return;

        await Sentry.close();
        this.isInitialized = false;
        logger.info('🔌 Sentry monitoring closed');
    }

    // Middleware for Express error handling
    errorHandler() {
        return Sentry.expressIntegration();
    }

    // Request monitoring middleware
    requestHandler() {
        return Sentry.expressIntegration();
    }

    // Database operation monitoring
    monitorDatabaseOperation(operation, table, startTime, success = true, error = null) {
        const duration = Date.now() - startTime;

        if (!success && error) {
            this.captureException(error, {
                tags: {
                    operation,
                    table,
                    type: 'database_error'
                },
                extra: {
                    duration
                }
            });
        }

        // Add performance breadcrumb
        this.addBreadcrumb(
            `DB ${operation} on ${table}`,
            'database',
            success ? 'info' : 'error',
            { duration, success }
        );
    }

    // API monitoring
    monitorApiCall(method, url, statusCode, startTime, userId = null) {
        const duration = Date.now() - startTime;

        if (statusCode >= 400) {
            this.captureMessage(`API Error: ${method} ${url} ${statusCode}`, 'warning', {
                tags: {
                    method,
                    url,
                    statusCode: statusCode.toString(),
                    type: 'api_error'
                },
                extra: {
                    duration,
                    userId
                }
            });
        }

        // Add performance breadcrumb
        this.addBreadcrumb(
            `API ${method} ${url}`,
            'http',
            statusCode >= 400 ? 'warning' : 'info',
            { statusCode, duration, userId }
        );
    }
}

// Export singleton instance
export const monitoring = new MonitoringService();

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    await monitoring.close();
});

process.on('SIGINT', async () => {
    await monitoring.close();
});

export default monitoring;