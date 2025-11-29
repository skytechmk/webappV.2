import express from 'express';
import * as systemController from '../controllers/systemController.js';

const router = express.Router();

// GET /api/system/storage - Get system and MinIO storage information
router.get('/storage', systemController.getSystemStorage);

// POST /api/system/clean-bucket - Clean/empty the MinIO bucket
router.post('/clean-bucket', systemController.cleanMinIOBucket);

// POST /api/system/clear-users - Clear all user data except admin
router.post('/clear-users', systemController.clearUsersDatabase);

export default router;