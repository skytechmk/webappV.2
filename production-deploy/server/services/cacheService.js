// Enhanced caching service with Redis support
// Falls back to in-memory cache when Redis is not available
import { redisService } from './redisService.js';

class CacheService {
    constructor() {
        this.memoryCache = new Map();
        this.isConnected = redisService.isConnected;
        this.useRedis = redisService.isConnected;

        if (this.useRedis) {
            console.log('✅ Redis cache initialized');
        } else {
            console.log('✅ In-memory cache initialized (Redis not available)');
        }
    }

    // Generic cache operations
    async get(key) {
        if (this.useRedis) {
            return await redisService.get(key);
        }

        // Fallback to in-memory cache
        if (!this.isConnected) return null;
        const item = this.memoryCache.get(key);
        if (!item) return null;

        // Check if expired
        if (item.expires && Date.now() > item.expires) {
            this.memoryCache.delete(key);
            return null;
        }

        return item.value;
    }

    async set(key, value, ttlSeconds = 300) {
        if (this.useRedis) {
            return await redisService.set(key, value, ttlSeconds);
        }

        // Fallback to in-memory cache
        if (!this.isConnected) return false;
        const expires = ttlSeconds > 0 ? Date.now() + (ttlSeconds * 1000) : null;
        this.memoryCache.set(key, { value, expires });
        return true;
    }

    async del(key) {
        if (this.useRedis) {
            return await redisService.del(key);
        }

        // Fallback to in-memory cache
        if (!this.isConnected) return false;
        return this.memoryCache.delete(key);
    }

    async exists(key) {
        if (this.useRedis) {
            return await redisService.exists(key);
        }

        // Fallback to in-memory cache
        if (!this.isConnected) return false;
        const item = this.memoryCache.get(key);
        if (!item) return false;

        // Check if expired
        if (item.expires && Date.now() > item.expires) {
            this.memoryCache.delete(key);
            return false;
        }

        return true;
    }

    // Application-specific cache methods
    async getUserEvents(userId) {
        const key = `user_events:${userId}`;
        return this.get(key);
    }

    async setUserEvents(userId, events, ttl = 300) {
        const key = `user_events:${userId}`;
        return this.set(key, events, ttl);
    }

    async invalidateUserEvents(userId) {
        const key = `user_events:${userId}`;
        return this.del(key);
    }

    async getEventMedia(eventId) {
        const key = `event_media:${eventId}`;
        return this.get(key);
    }

    async setEventMedia(eventId, media, ttl = 600) {
        const key = `event_media:${eventId}`;
        return this.set(key, media, ttl);
    }

    async invalidateEventMedia(eventId) {
        const key = `event_media:${eventId}`;
        return this.del(key);
    }

    async getEventDetails(eventId) {
        const key = `event_details:${eventId}`;
        return this.get(key);
    }

    async setEventDetails(eventId, event, ttl = 600) {
        const key = `event_details:${eventId}`;
        return this.set(key, event, ttl);
    }

    async invalidateEventDetails(eventId) {
        const key = `event_details:${eventId}`;
        return this.del(key);
    }

    // Session and authentication caching
    async getUserSession(token) {
        const key = `session:${token}`;
        return this.get(key);
    }

    async setUserSession(token, userData, ttl = 3600) {
        const key = `session:${token}`;
        return this.set(key, userData, ttl);
    }

    async invalidateUserSession(token) {
        const key = `session:${token}`;
        return this.del(key);
    }

    // Rate limiting cache
    async getRateLimit(key) {
        const cacheKey = `ratelimit:${key}`;
        return this.get(cacheKey);
    }

    async setRateLimit(key, data, ttl = 60) {
        const cacheKey = `ratelimit:${key}`;
        return this.set(cacheKey, data, ttl);
    }

    // Cache warming for frequently accessed data
    async warmCache() {
        console.log('🔥 Warming cache with frequently accessed data...');
        // This would be called periodically to pre-populate cache
        // Implementation depends on specific access patterns
    }

    // Cache statistics
    async getStats() {
        if (this.useRedis) {
            const redisStats = await redisService.getStats();
            return {
                ...redisStats,
                cacheType: 'redis'
            };
        }

        // Fallback to in-memory cache stats
        if (!this.isConnected) {
            return { connected: false, cacheType: 'memory' };
        }

        // Clean expired items
        const now = Date.now();
        let expiredCount = 0;
        for (const [key, item] of this.memoryCache.entries()) {
            if (item.expires && now > item.expires) {
                this.memoryCache.delete(key);
                expiredCount++;
            }
        }

        return {
            connected: true,
            cacheType: 'memory',
            size: this.memoryCache.size,
            expiredCleaned: expiredCount,
            memoryUsage: JSON.stringify([...this.memoryCache.entries()]).length
        };
    }

    // Graceful shutdown
    async close() {
        if (this.useRedis) {
            await redisService.close();
        }
        this.memoryCache.clear();
        this.isConnected = false;
        console.log('🔌 Cache service closed');
    }
}

// Export singleton instance
export const cacheService = new CacheService();

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    await cacheService.close();
});

process.on('SIGINT', async () => {
    await cacheService.close();
});

export default cacheService;