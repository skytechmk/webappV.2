// Logging service using Winston for structured logging
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

const level = () => {
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'warn';
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

// Define format for logs
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`,
    ),
);

// Define which transports the logger must use
const transports = [
    // Console transport for development
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }),

    // Error log file
    new winston.transports.File({
        filename: path.join(__dirname, '../../logs/error.log'),
        level: 'error',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
        )
    }),

    // Combined log file
    new winston.transports.File({
        filename: path.join(__dirname, '../../logs/combined.log'),
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
        )
    }),
];

// Create the winston logger instance
const winstonLogger = winston.createLogger({
    level: level(),
    levels,
    format,
    transports,
});

// Create logs directory if it doesn't exist
import fs from 'fs';
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Export logger methods with additional context
class LoggerService {
    constructor() {
        this.logger = winstonLogger;
    }

    // Error logging with stack traces
    error(message, meta = {}) {
        this.logger.error(message, {
            ...meta,
            timestamp: new Date().toISOString()
        });
    }

    // Warning logging
    warn(message, meta = {}) {
        this.logger.warn(message, {
            ...meta,
            timestamp: new Date().toISOString()
        });
    }

    // Info logging
    info(message, meta = {}) {
        this.logger.info(message, {
            ...meta,
            timestamp: new Date().toISOString()
        });
    }

    // HTTP request logging
    http(message, meta = {}) {
        this.logger.http(message, {
            ...meta,
            timestamp: new Date().toISOString()
        });
    }

    // Debug logging (only in development)
    debug(message, meta = {}) {
        this.logger.debug(message, {
            ...meta,
            timestamp: new Date().toISOString()
        });
    }

    // Request logging middleware
    requestLogger() {
        return (req, res, next) => {
            const start = Date.now();

            res.on('finish', () => {
                const duration = Date.now() - start;
                const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;

                if (res.statusCode >= 400) {
                    this.error(message, {
                        method: req.method,
                        url: req.originalUrl,
                        statusCode: res.statusCode,
                        duration,
                        userAgent: req.get('User-Agent'),
                        ip: req.ip
                    });
                } else {
                    this.http(message, {
                        method: req.method,
                        url: req.originalUrl,
                        statusCode: res.statusCode,
                        duration,
                        userAgent: req.get('User-Agent'),
                        ip: req.ip
                    });
                }
            });

            next();
        };
    }

    // Database operation logging
    dbOperation(operation, table, duration, success = true, meta = {}) {
        const message = `DB ${operation} on ${table} - ${duration}ms`;
        if (success) {
            this.debug(message, { ...meta, operation, table, duration });
        } else {
            this.error(message, { ...meta, operation, table, duration });
        }
    }

    // Authentication logging
    authEvent(event, userId, success = true, meta = {}) {
        const message = `Auth ${event} for user ${userId || 'unknown'}`;
        if (success) {
            this.info(message, { ...meta, event, userId });
        } else {
            this.warn(message, { ...meta, event, userId });
        }
    }

    // Cache operation logging
    cacheOperation(operation, key, hit = true, meta = {}) {
        const status = hit ? 'hit' : 'miss';
        this.debug(`Cache ${operation} ${status}: ${key}`, { ...meta, operation, key, hit });
    }

    // Performance monitoring
    performance(metric, value, meta = {}) {
        this.info(`Performance: ${metric} = ${value}`, { ...meta, metric, value });
    }
}

// Export singleton instance
export const logger = new LoggerService();

// Export winston logger for advanced usage
export { logger as winstonLogger };

export default logger;