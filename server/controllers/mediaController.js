import path from 'path';
import fs from 'fs';
import { db } from '../config/db.js';
import { deleteFromS3 } from '../services/storage.js';
import { queueFileUpload, getUploadProgress } from '../services/uploadService.js';
import { checkRateLimit, RateLimitStore } from '../middleware/rateLimiter.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '../../server/uploads');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

function getPublicUrl(key) { return `/api/proxy-media?key=${encodeURIComponent(key)}`; }

class ProcessQueue {
    constructor(concurrency = 2) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
    }

    add(task) {
        this.queue.push(task);
        this.next();
    }

    next() {
        if (this.running >= this.concurrency || this.queue.length === 0) return;
        const task = this.queue.shift();
        this.running++;
        task().finally(() => {
            this.running--;
            this.next();
        });
    }
}
const videoQueue = new ProcessQueue(2);

export const uploadMedia = async (req, res) => {
    console.log('Upload attempt:', { file: req.file ? req.file.originalname : 'none', body: req.body });

    if (!req.file) {
        console.log('Upload failed: No file provided');
        return res.status(400).json({ error: 'No file provided' });
    }

    const body = req.body;
    let uploaderId = body.uploaderId;

    // Validate uploader identity
    if (req.user) {
        if (uploaderId !== req.user.id) {
            console.log('Upload failed: Identity mismatch', { uploaderId, userId: req.user.id });
            return res.status(403).json({ error: "Identity mismatch" });
        }
    } else {
        if (!uploaderId || !uploaderId.startsWith('guest-')) {
            uploaderId = `guest-anon-${Date.now()}`;
        }
    }

    try {
        // Queue the upload for background processing
        const result = await queueFileUpload(req.file, {
            id: body.id,
            eventId: body.eventId,
            type: body.type,
            caption: body.caption,
            uploadedAt: body.uploadedAt,
            uploaderName: body.uploaderName,
            isWatermarked: body.isWatermarked,
            watermarkText: body.watermarkText,
            privacy: body.privacy || 'public'
        }, req.user?.id);

        // Return immediate response with upload ID
        res.json({
            uploadId: result.uploadId,
            status: 'queued',
            message: 'Upload queued for processing'
        });

    } catch (error) {
        console.error('Upload queue failed:', error);

        // Cleanup temp file
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, () => {});
        }

        res.status(500).json({
            error: error.message || 'Upload failed',
            uploadId: body.id
        });
    }
};

// New endpoint to check upload progress
export const getUploadStatus = (req, res) => {
    const { uploadId } = req.params;
    const progress = getUploadProgress(uploadId);

    res.json({
        uploadId,
        ...progress
    });
};

export const deleteMedia = (req, res) => {
    db.get(`SELECT media.url, media.previewUrl, events.hostId, media.uploaderId FROM media JOIN events ON media.eventId = events.id WHERE media.id = ?`, [req.params.id], async (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Not found" });
        if (req.user.role !== 'ADMIN' && row.hostId !== req.user.id && row.uploaderId !== req.user.id) return res.sendStatus(403);
        try {
            if (row.url) await deleteFromS3(row.url);
            if (row.previewUrl) await deleteFromS3(row.previewUrl);
        } catch (e) { }
        db.run("DELETE FROM media WHERE id = ?", req.params.id, (err) => res.json({ success: true }));
    });
};

export const bulkDeleteMedia = async (req, res) => {
    const { mediaIds } = req.body;
    if (!Array.isArray(mediaIds) || mediaIds.length === 0) return res.status(400).json({ error: "No media IDs provided" });
    const placeholders = mediaIds.map(() => '?').join(',');
    const query = `SELECT media.id, media.url, media.previewUrl, events.hostId, media.uploaderId, media.eventId FROM media JOIN events ON media.eventId = events.id WHERE media.id IN (${placeholders})`;
    db.all(query, mediaIds, async (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        let deletedCount = 0;
        const deletePromises = rows.map(async (row) => {
            if (req.user.role !== 'ADMIN' && row.hostId !== req.user.id && row.uploaderId !== req.user.id) return;
            try {
                if (row.url) await deleteFromS3(row.url);
                if (row.previewUrl) await deleteFromS3(row.previewUrl);
                await new Promise((resolve) => db.run("DELETE FROM media WHERE id = ?", [row.id], () => { deletedCount++; resolve(true); }));
            } catch (e) { }
        });
        await Promise.all(deletePromises);
        res.json({ success: true, deletedCount });
    });
};

export const likeMedia = (req, res) => {
    // Implementation for liking media
    // Note: The original code didn't have a specific endpoint logic for this in the snippet provided,
    // but the route was mentioned. Assuming basic increment.
    db.run("UPDATE media SET likes = likes + 1 WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
};
