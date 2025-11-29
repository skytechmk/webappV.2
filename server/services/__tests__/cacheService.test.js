import { cacheService } from '../cacheService.js';
import { redisService } from '../redisService.js';

// Mock Redis service
jest.mock('../redisService.js', () => ({
    redisService: {
        isConnected: false,
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        exists: jest.fn()
    }
}));

describe('Cache Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset cache service state
        cacheService.memoryCache.clear();
        cacheService.isConnected = true;
        cacheService.useRedis = false;
    });

    describe('Memory Cache (fallback)', () => {
        beforeEach(() => {
            cacheService.useRedis = false;
        });

        test('should set and get values', async () => {
            const key = 'test-key';
            const value = { data: 'test-value' };

            const setResult = await cacheService.set(key, value);
            expect(setResult).toBe(true);

            const getResult = await cacheService.get(key);
            expect(getResult).toEqual(value);
        });

        test('should handle TTL expiration', async () => {
            const key = 'expiring-key';
            const value = { data: 'expires' };

            // Set with very short TTL (1 second)
            await cacheService.set(key, value, 1);

            // Should exist immediately
            let result = await cacheService.get(key);
            expect(result).toEqual(value);

            // Wait for expiration (mock by manipulating internal state)
            const item = cacheService.memoryCache.get(key);
            if (item) {
                item.expires = Date.now() - 1000; // Set to expired
            }

            // Should return null after expiration
            result = await cacheService.get(key);
            expect(result).toBeNull();
        });

        test('should delete values', async () => {
            const key = 'delete-key';
            const value = { data: 'to-delete' };

            await cacheService.set(key, value);
            let result = await cacheService.get(key);
            expect(result).toEqual(value);

            await cacheService.del(key);
            result = await cacheService.get(key);
            expect(result).toBeNull();
        });

        test('should check existence', async () => {
            const key = 'exists-key';
            const value = { data: 'exists' };

            let exists = await cacheService.exists(key);
            expect(exists).toBe(false);

            await cacheService.set(key, value);
            exists = await cacheService.exists(key);
            expect(exists).toBe(true);
        });
    });

    describe('Redis Cache (when available)', () => {
        beforeEach(() => {
            cacheService.useRedis = true;
            redisService.isConnected = true;
        });

        test('should use Redis for get operations', async () => {
            const key = 'redis-key';
            const mockValue = { data: 'redis-value' };

            redisService.get.mockResolvedValue(mockValue);

            const result = await cacheService.get(key);

            expect(redisService.get).toHaveBeenCalledWith(key);
            expect(result).toEqual(mockValue);
        });

        test('should use Redis for set operations', async () => {
            const key = 'redis-set-key';
            const value = { data: 'redis-set-value' };

            redisService.set.mockResolvedValue(true);

            const result = await cacheService.set(key, value, 300);

            expect(redisService.set).toHaveBeenCalledWith(key, value, 300);
            expect(result).toBe(true);
        });

        test('should use Redis for delete operations', async () => {
            const key = 'redis-delete-key';

            redisService.del.mockResolvedValue(true);

            const result = await cacheService.del(key);

            expect(redisService.del).toHaveBeenCalledWith(key);
            expect(result).toBe(true);
        });

        test('should use Redis for exists operations', async () => {
            const key = 'redis-exists-key';

            redisService.exists.mockResolvedValue(true);

            const result = await cacheService.exists(key);

            expect(redisService.exists).toHaveBeenCalledWith(key);
            expect(result).toBe(true);
        });
    });

    describe('Cache Statistics', () => {
        test('should return memory cache stats when Redis unavailable', async () => {
            cacheService.useRedis = false;
            await cacheService.set('test', 'value');

            const stats = await cacheService.getStats();

            expect(stats).toEqual({
                connected: true,
                cacheType: 'memory',
                size: 1,
                expiredCleaned: 0,
                memoryUsage: expect.any(Number)
            });
        });

        test('should return Redis stats when Redis available', async () => {
            cacheService.useRedis = true;
            redisService.isConnected = true;

            const mockRedisStats = {
                connected: true,
                dbSize: 10,
                info: { version: '7.0.0' }
            };

            redisService.getStats = jest.fn().mockResolvedValue(mockRedisStats);

            const stats = await cacheService.getStats();

            expect(stats).toEqual({
                ...mockRedisStats,
                cacheType: 'redis'
            });
        });
    });

    describe('Application-specific methods', () => {
        beforeEach(() => {
            // Ensure Redis is properly mocked and cache service uses it
            redisService.isConnected = true;
            cacheService.useRedis = true;
            cacheService.isConnected = true;
        });

        test('should handle user events caching', async () => {
            const userId = 'user-123';
            const events = [{ id: 'event-1', title: 'Test Event' }];

            redisService.set.mockResolvedValue(true);
            redisService.get.mockResolvedValue(events);

            await cacheService.setUserEvents(userId, events);
            const result = await cacheService.getUserEvents(userId);

            expect(redisService.set).toHaveBeenCalledWith(`user_events:${userId}`, events, 300);
            expect(redisService.get).toHaveBeenCalledWith(`user_events:${userId}`);
            expect(result).toEqual(events);
        });

        test('should handle event media caching', async () => {
            const eventId = 'event-123';
            const media = [{ id: 'media-1', type: 'image' }];

            redisService.set.mockResolvedValue(true);
            redisService.get.mockResolvedValue(media);

            await cacheService.setEventMedia(eventId, media);
            const result = await cacheService.getEventMedia(eventId);

            expect(redisService.set).toHaveBeenCalledWith(`event_media:${eventId}`, media, 600);
            expect(redisService.get).toHaveBeenCalledWith(`event_media:${eventId}`);
            expect(result).toEqual(media);
        });

        test('should handle cache invalidation', async () => {
            const userId = 'user-123';
            const eventId = 'event-123';

            redisService.del.mockResolvedValue(true);

            await cacheService.invalidateUserEvents(userId);
            await cacheService.invalidateEventMedia(eventId);

            expect(redisService.del).toHaveBeenCalledWith(`user_events:${userId}`);
            expect(redisService.del).toHaveBeenCalledWith(`event_media:${eventId}`);
        });
    });
});