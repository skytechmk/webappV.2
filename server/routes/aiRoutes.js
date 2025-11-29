import express from 'express';
import * as aiController from '../controllers/aiController.js';
import { aiLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/generate-caption', aiLimiter, aiController.generateCaption);
router.post('/generate-event-description', aiLimiter, aiController.generateEventDescription);

export default router;
