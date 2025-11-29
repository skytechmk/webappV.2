// Media Service - Handles all media-related operations
import { db } from '../config/db.js';
import { cacheService } from './cacheService.js';
import { uploadToS3, deleteFromS3, getS3Object } from './storage.js';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

class MediaService {
    constructor() {
        this.allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
        this.maxImageSize = 10 * 1024 * 1024; // 10MB
        this.maxVideoSize = 100 * 1024 * 1024; // 100MB
    }

    // Validate file type and size
    validateFile(file, type) {
        if (!this.allowedTypes.includes(file.mimetype)) {
            throw new Error(`Unsupported file type: ${file.mimetype}`);
        }

        const maxSize = type === 'video' ? this.maxVideoSize : this.maxImageSize;
        if (file.size > maxSize) {
            throw new Error(`File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`);
        }

        return true;
    }

    // Process and optimize image
    async processImage(buffer, options = {}) {
        const {
            maxWidth = 1920,
            maxHeight = 1080,
            quality = 85,
            format = 'jpeg'
        } = options;

        let sharpInstance = sharp(buffer);

        // Get image metadata
        const metadata = await sharpInstance.metadata();

        // Resize if needed
        if (metadata.width > maxWidth || metadata.height > maxHeight) {
            sharpInstance = sharpInstance.resize(maxWidth, maxHeight, {
                fit: 'inside',
                withoutEnlargement: true
            });
        }

        // Convert and compress
        if (format === 'jpeg') {
            sharpInstance = sharpInstance.jpeg({ quality });
        } else if (format === 'webp') {
            sharpInstance = sharpInstance.webp({ quality });
        }

        return sharpInstance.toBuffer();
    }

    // Generate thumbnail for video
    async generateVideoThumbnail(videoBuffer) {
        // This would use ffmpeg to extract a frame
        // For now, return a placeholder
        const placeholder = Buffer.from('placeholder thumbnail');
        return placeholder;
    }

    // Upload media file
    async uploadMedia(file, metadata, eventId, userId) {
        try {
            // Validate file
            this.validateFile(file, metadata.type);

            let processedBuffer = file.buffer;
            let thumbnailBuffer = null;

            // Process based on type
            if (metadata.type === 'image') {
                processedBuffer = await this.processImage(file.buffer);

                // Generate thumbnail (smaller version)
                thumbnailBuffer = await this.processImage(file.buffer, {
                    maxWidth: 400,
                    maxHeight: 400,
                    quality: 80
                });
            } else if (metadata.type === 'video') {
                // For videos, we might want to generate a thumbnail
                thumbnailBuffer = await this.generateVideoThumbnail(file.buffer);
            }

            // Generate unique filename
            const fileId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const fileKey = `media/${eventId}/${fileId}.${metadata.type === 'video' ? 'mp4' : 'jpg'}`;
            const thumbnailKey = `thumbnails/${eventId}/${fileId}.jpg`;

            // Upload to storage
            const uploadPromises = [
                uploadToS3(processedBuffer, fileKey, file.mimetype)
            ];

            if (thumbnailBuffer) {
                uploadPromises.push(
                    uploadToS3(thumbnailBuffer, thumbnailKey, 'image/jpeg')
                );
            }

            await Promise.all(uploadPromises);

            // Save to database
            const mediaData = {
                id: fileId,
                eventId,
                type: metadata.type,
                url: fileKey,
                previewUrl: thumbnailKey,
                caption: metadata.caption || '',
                uploadedAt: new Date().toISOString(),
                uploaderName: metadata.uploaderName,
                uploaderId: metadata.uploaderId || userId,
                isWatermarked: metadata.isWatermarked || false,
                watermarkText: metadata.watermarkText || null,
                likes: 0,
                privacy: metadata.privacy || 'public'
            };

            const stmt = db.prepare(`
                INSERT INTO media (id, eventId, type, url, previewUrl, caption, uploadedAt, uploaderName, uploaderId, isWatermarked, watermarkText, likes, privacy)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                mediaData.id,
                mediaData.eventId,
                mediaData.type,
                mediaData.url,
                mediaData.previewUrl,
                mediaData.caption,
                mediaData.uploadedAt,
                mediaData.uploaderName,
                mediaData.uploaderId,
                mediaData.isWatermarked ? 1 : 0,
                mediaData.watermarkText,
                mediaData.likes,
                mediaData.privacy
            );

            // Invalidate cache
            await cacheService.invalidateEventMedia(eventId);

            return mediaData;
        } catch (error) {
            console.error('Media upload error:', error);
            throw error;
        }
    }

    // Get media by event ID
    async getMediaByEventId(eventId, options = {}) {
        const { limit = 50, offset = 0, userId = null } = options;

        let query = `
            SELECT * FROM media
            WHERE eventId = ?
            ORDER BY uploadedAt DESC
        `;

        const params = [eventId];

        // Add privacy filtering if user is specified
        if (userId) {
            query += ` AND (privacy = 'public' OR uploaderId = ?)`;
            params.push(userId);
        }

        query += ` LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const media = db.prepare(query).all(...params);

        // Attach signed URLs
        return media.map(item => ({
            ...item,
            url: this.getSignedUrl(item.url),
            previewUrl: item.previewUrl ? this.getSignedUrl(item.previewUrl) : null
        }));
    }

    // Get media by ID
    getMediaById(mediaId) {
        const media = db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId);
        if (!media) return null;

        return {
            ...media,
            url: this.getSignedUrl(media.url),
            previewUrl: media.previewUrl ? this.getSignedUrl(media.previewUrl) : null
        };
    }

    // Delete media
    async deleteMedia(mediaId, userId = null) {
        const media = db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId);
        if (!media) {
            throw new Error('Media not found');
        }

        // Check permissions if userId provided
        if (userId && media.uploaderId !== userId) {
            // Additional permission checks would go here
            throw new Error('Permission denied');
        }

        // Delete from storage
        const deletePromises = [deleteFromS3(media.url)];
        if (media.previewUrl) {
            deletePromises.push(deleteFromS3(media.previewUrl));
        }
        await Promise.all(deletePromises);

        // Delete from database
        db.prepare('DELETE FROM media WHERE id = ?').run(mediaId);

        // Invalidate cache
        await cacheService.invalidateEventMedia(media.eventId);

        return { success: true };
    }

    // Bulk delete media
    async bulkDeleteMedia(mediaIds, userId = null) {
        const results = [];
        let successCount = 0;

        for (const mediaId of mediaIds) {
            try {
                await this.deleteMedia(mediaId, userId);
                successCount++;
                results.push({ id: mediaId, success: true });
            } catch (error) {
                results.push({ id: mediaId, success: false, error: error.message });
            }
        }

        return {
            success: successCount > 0,
            deletedCount: successCount,
            totalCount: mediaIds.length,
            results
        };
    }

    // Like/unlike media
    async toggleLike(mediaId, userId) {
        // This would typically use a separate likes table
        // For now, just increment the counter
        const stmt = db.prepare('UPDATE media SET likes = likes + 1 WHERE id = ?');
        const result = stmt.run(mediaId);

        if (result.changes === 0) {
            throw new Error('Media not found');
        }

        // Get updated media
        const media = this.getMediaById(mediaId);

        // Invalidate cache
        await cacheService.invalidateEventMedia(media.eventId);

        return media;
    }

    // Get signed URL for private access
    getSignedUrl(key) {
        // This would generate a signed URL for S3
        // For now, return the key (assuming public access)
        return key;
    }

    // Get media statistics
    getMediaStats(eventId = null) {
        let query = 'SELECT COUNT(*) as total, type FROM media';
        const params = [];

        if (eventId) {
            query += ' WHERE eventId = ?';
            params.push(eventId);
        }

        query += ' GROUP BY type';

        const stats = db.prepare(query).all(...params);
        return stats;
    }

    // Search media
    searchMedia(query, eventId = null, options = {}) {
        const { limit = 20, offset = 0 } = options;
        const searchTerm = `%${query}%`;

        let sql = `
            SELECT * FROM media
            WHERE (caption LIKE ? OR uploaderName LIKE ?)
        `;

        const params = [searchTerm, searchTerm];

        if (eventId) {
            sql += ' AND eventId = ?';
            params.push(eventId);
        }

        sql += ' ORDER BY uploadedAt DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const media = db.prepare(sql).all(...params);
        return media.map(item => ({
            ...item,
            url: this.getSignedUrl(item.url),
            previewUrl: item.previewUrl ? this.getSignedUrl(item.previewUrl) : null
        }));
    }
}

export const mediaService = new MediaService();
export default mediaService;