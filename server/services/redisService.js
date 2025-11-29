// Redis service for distributed caching
import { createClient } from 'redis';
import { config } from '../config/env.js';

class RedisService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.init();
    }

    async init() {
        try {
            this.client = createClient({
                host: config.REDIS.HOST,
                port: config.REDIS.PORT,
                password: config.REDIS.PASSWORD,
                database: config.REDIS.DB,
                retry_strategy: (options) => {
                    if (options.error && options.error.code === 'ECONNREFUSED') {
                        console.error('Redis connection refused');
                        return new Error('Redis connection refused');
                    }
                    if (options.total_retry_time > 1000 * 60 * 60) {
                        console.error('Redis retry time exhausted');
                        return new Error('Retry time exhausted');
                    }
                    if (options.attempt > 10) {
                        console.error('Redis max retry attempts reached');
                        return undefined;
                    }
                    // Exponential backoff
                    return Math.min(options.attempt * 100, 3000);
                }
            });

            this.client.on('error', (err) => {
                console.error('Redis Client Error:', err);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                console.log('✅ Connected to Redis');
                this.isConnected = true;
            });

            this.client.on('ready', () => {
                console.log('✅ Redis client ready');
            });

            this.client.on('end', () => {
                console.log('🔌 Redis connection ended');
                this.isConnected = false;
            });

            await this.client.connect();
        } catch (error) {
            console.warn('Failed to connect to Redis, falling back to in-memory cache:', error.message);
            this.isConnected = false;
        }
    }

    async get(key) {
        if (!this.isConnected || !this.client) return null;
        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('Redis GET error:', error);
            return null;
        }
    }

    async set(key, value, ttlSeconds = 300) {
        if (!this.isConnected || !this.client) return false;
        try {
            const serializedValue = JSON.stringify(value);
            if (ttlSeconds > 0) {
                await this.client.setEx(key, ttlSeconds, serializedValue);
            } else {
                await this.client.set(key, serializedValue);
            }
            return true;
        } catch (error) {
            console.error('Redis SET error:', error);
            return false;
        }
    }

    async del(key) {
        if (!this.isConnected || !this.client) return false;
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error('Redis DEL error:', error);
            return false;
        }
    }

    async exists(key) {
        if (!this.isConnected || !this.client) return false;
        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            console.error('Redis EXISTS error:', error);
            return false;
        }
    }

    async expire(key, ttlSeconds) {
        if (!this.isConnected || !this.client) return false;
        try {
            await this.client.expire(key, ttlSeconds);
            return true;
        } catch (error) {
            console.error('Redis EXPIRE error:', error);
            return false;
        }
    }

    async ttl(key) {
        if (!this.isConnected || !this.client) return -2;
        try {
            return await this.client.ttl(key);
        } catch (error) {
            console.error('Redis TTL error:', error);
            return -2;
        }
    }

    async keys(pattern) {
        if (!this.isConnected || !this.client) return [];
        try {
            return await this.client.keys(pattern);
        } catch (error) {
            console.error('Redis KEYS error:', error);
            return [];
        }
    }

    async flushAll() {
        if (!this.isConnected || !this.client) return false;
        try {
            await this.client.flushAll();
            return true;
        } catch (error) {
            console.error('Redis FLUSHALL error:', error);
            return false;
        }
    }

    async getStats() {
        if (!this.isConnected || !this.client) {
            return { connected: false };
        }

        try {
            const info = await this.client.info();
            const dbSize = await this.client.dbSize();

            return {
                connected: true,
                dbSize,
                info: info.split('\n').reduce((acc, line) => {
                    const [key, value] = line.split(':');
                    if (key && value) {
                        acc[key] = value;
                    }
                    return acc;
                }, {})
            };
        } catch (error) {
            console.error('Redis STATS error:', error);
            return { connected: false, error: error.message };
        }
    }

    async close() {
        if (this.client && this.isConnected) {
            await this.client.quit();
            this.isConnected = false;
            console.log('🔌 Redis connection closed');
        }
    }
}

// Export singleton instance
export const redisService = new RedisService();

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    await redisService.close();
});

process.on('SIGINT', async () => {
    await redisService.close();
});

export default redisService;