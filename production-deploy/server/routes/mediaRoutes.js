import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mediaController from '../controllers/mediaController.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { uploadLimiter, checkRateLimit, RateLimitStore } from '../middleware/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '../../server/uploads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    // limits: { fileSize: Infinity }, // Unlimited
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'
        ];
        if (!allowedMimes.includes(file.mimetype)) return cb(new Error('Invalid file type'), false);

        const clientIP = req.ip || req.connection.remoteAddress;
        if (!checkRateLimit(RateLimitStore.upload, clientIP, 50, 60 * 60 * 1000)) {
            return cb(new Error('Upload limit exceeded. Please try again later.'), false);
        }
        cb(null, true);
    }
});

const router = express.Router();

router.post('/', uploadLimiter, optionalAuth, upload.single('file'), mediaController.uploadMedia);
router.get('/upload/:uploadId/status', optionalAuth, mediaController.getUploadStatus);
router.delete('/:id', authenticateToken, mediaController.deleteMedia);
router.post('/bulk-delete', authenticateToken, mediaController.bulkDeleteMedia);
router.put('/:id/like', mediaController.likeMedia);

export default router;
