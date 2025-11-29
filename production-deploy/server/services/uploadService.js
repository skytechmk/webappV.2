// Optimized File Upload Service with Streaming
// Implements background processing and progress tracking

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { spawn } from 'child_process';
import { db } from '../config/db.js';
import { uploadToS3, deleteFromS3 } from './storage.js';
import { getIo } from './socket.js';
import { cacheService } from './cacheService.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '../../server/uploads');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Upload queue for background processing
class UploadQueue {
    constructor(concurrency = 3) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
    }

    add(task) {
        this.queue.push(task);
        this.process();
    }

    process() {
        if (this.running >= this.concurrency || this.queue.length === 0) return;

        const task = this.queue.shift();
        this.running++;

        task().finally(() => {
            this.running--;
            this.process();
        });
    }
}

const uploadQueue = new UploadQueue(3);

// Progress tracking
const uploadProgress = new Map();

export const getUploadProgress = (uploadId) => {
    return uploadProgress.get(uploadId) || { status: 'unknown', progress: 0 };
};

export const processFileUpload = async (file, metadata, userId = null) => {
    const uploadId = metadata.id;
    const eventId = metadata.eventId;
    const isVideo = metadata.type === 'video';

    console.log(`🎬 Starting upload processing for ${uploadId}`);

    // Initialize progress tracking
    uploadProgress.set(uploadId, { status: 'processing', progress: 0 });

    try {
        // Check storage limits for registered users
        if (userId) {
            await checkStorageLimits(userId, file.size);
        }

        // Generate file paths
        const ext = path.extname(file.originalname);
        const s3Key = `events/${eventId}/${uploadId}${ext}`;
        const previewKey = isVideo ? `events/${eventId}/preview_${uploadId}.mp4` : `events/${eventId}/thumb_${uploadId}.jpg`;

        // Insert initial record
        await insertMediaRecord(metadata, s3Key, previewKey, userId);

        // Notify clients upload started
        notifyUploadProgress(eventId, uploadId, 'started', 0);

        if (!isVideo) {
            // Process image
            await processImageUpload(file, s3Key, previewKey, eventId, uploadId);
        } else {
            // Process video
            await processVideoUpload(file, s3Key, previewKey, eventId, uploadId);
        }

        // Update storage usage
        if (userId) {
            await updateStorageUsage(userId, file.size);
        }

        // Invalidate event media cache
        await cacheService.invalidateEventMedia(eventId);

        // Mark as completed
        uploadProgress.set(uploadId, { status: 'completed', progress: 100 });
        notifyUploadProgress(eventId, uploadId, 'completed', 100);

        console.log(`✅ Upload completed for ${uploadId}`);
        return { success: true, uploadId };

    } catch (error) {
        console.error(`❌ Upload failed for ${uploadId}:`, error);

        // Mark as failed
        uploadProgress.set(uploadId, { status: 'failed', progress: 0, error: error.message });

        // Notify clients
        notifyUploadProgress(eventId, uploadId, 'failed', 0, error.message);

        // Cleanup
        await cleanupFailedUpload(uploadId);

        throw error;
    }
};

const checkStorageLimits = async (userId, fileSize) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT storageUsedMb, storageLimitMb FROM users WHERE id = ?", [userId], (err, user) => {
            if (err) return reject(err);
            if (!user) return reject(new Error('User not found'));

            const fileSizeMb = fileSize / (1024 * 1024);
            if (user.storageLimitMb !== -1 && (user.storageUsedMb + fileSizeMb > user.storageLimitMb)) {
                reject(new Error('Storage limit exceeded'));
            } else {
                resolve();
            }
        });
    });
};

const insertMediaRecord = async (metadata, s3Key, previewKey, userId) => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT INTO media (id, eventId, type, url, previewUrl, isProcessing, caption, uploadedAt, uploaderName, uploaderId, isWatermarked, watermarkText, likes, privacy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        stmt.run(
            metadata.id,
            metadata.eventId,
            metadata.type,
            s3Key,
            metadata.type === 'video' ? '' : previewKey,
            metadata.type === 'video' ? 1 : 0,
            metadata.caption,
            metadata.uploadedAt,
            metadata.uploaderName,
            userId,
            metadata.isWatermarked === 'true' ? 1 : 0,
            metadata.watermarkText,
            0,
            metadata.privacy || 'public',
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
        stmt.finalize();
    });
};

const processImageUpload = async (file, s3Key, previewKey, eventId, uploadId) => {
    console.log(`🖼️ Processing image upload for ${uploadId}`);

    // Create thumbnail
    const previewPath = path.join(uploadDir, `thumb_${uploadId}.jpg`);

    try {
        await sharp(file.path)
            .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80, progressive: true })
            .toFile(previewPath);

        console.log(`📤 Uploading image and thumbnail to S3 for ${uploadId}`);

        // Upload both files in parallel
        await Promise.all([
            uploadToS3(file.path, s3Key, file.mimetype),
            uploadToS3(previewPath, previewKey, 'image/jpeg')
        ]);

        // Update progress
        notifyUploadProgress(eventId, uploadId, 'uploading', 75);

        // Cleanup temp files
        fs.unlinkSync(previewPath);

        console.log(`✅ Image upload completed for ${uploadId}`);

    } catch (error) {
        // Cleanup on error
        if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
        throw error;
    }
};

const processVideoUpload = async (file, s3Key, previewKey, eventId, uploadId) => {
    console.log(`🎥 Processing video upload for ${uploadId}`);

    return new Promise((resolve, reject) => {
        const inputPath = file.path;
        const outputPath = path.join(uploadDir, `preview_${uploadId}.mp4`);

        // Update progress
        notifyUploadProgress(eventId, uploadId, 'processing', 25);

        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-vf', 'scale=-2:720',
            '-c:v', 'libx264',
            '-crf', '23',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-y',
            outputPath
        ]);

        ffmpeg.on('close', async (code) => {
            try {
                if (code === 0) {
                    console.log(`📤 Uploading video and preview to S3 for ${uploadId}`);

                    // Upload both files
                    await Promise.all([
                        uploadToS3(inputPath, s3Key, file.mimetype),
                        uploadToS3(outputPath, previewKey, 'video/mp4')
                    ]);

                    // Update database
                    db.run("UPDATE media SET isProcessing = 0, previewUrl = ? WHERE id = ?", [previewKey, uploadId]);

                    // Notify completion
                    notifyUploadProgress(eventId, uploadId, 'completed', 100);

                    console.log(`✅ Video upload completed for ${uploadId}`);
                    resolve();
                } else {
                    throw new Error(`FFmpeg failed with code ${code}`);
                }
            } catch (error) {
                reject(error);
            } finally {
                // Cleanup temp files
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            }
        });

        ffmpeg.on('error', (err) => {
            console.error(`FFmpeg error for ${uploadId}:`, err);
            reject(err);
        });
    });
};

const updateStorageUsage = async (userId, fileSize) => {
    return new Promise((resolve, reject) => {
        const fileSizeMb = fileSize / (1024 * 1024);
        db.run("UPDATE users SET storageUsedMb = storageUsedMb + ? WHERE id = ?", [fileSizeMb, userId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

const notifyUploadProgress = (eventId, uploadId, status, progress, error = null) => {
    const io = getIo();
    if (io) {
        io.to(eventId).emit('upload_progress', {
            uploadId,
            status,
            progress,
            error,
            timestamp: Date.now()
        });
    }
};

const cleanupFailedUpload = async (uploadId) => {
    return new Promise((resolve) => {
        db.run("DELETE FROM media WHERE id = ?", [uploadId], () => {
            uploadProgress.delete(uploadId);
            resolve();
        });
    });
};

// Queue-based upload processing
export const queueFileUpload = (file, metadata, userId = null) => {
    return new Promise((resolve, reject) => {
        uploadQueue.add(async () => {
            try {
                const result = await processFileUpload(file, metadata, userId);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
    });
};

// Export for use in controllers
export { uploadQueue };