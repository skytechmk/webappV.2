import express from 'express';
import * as eventController from '../controllers/eventController.js';
import { authenticateToken } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.get('/', apiLimiter, authenticateToken, eventController.getEvents);
router.get('/:id', eventController.getEventById);
router.post('/', authenticateToken, eventController.createEvent);
router.put('/:id', authenticateToken, eventController.updateEvent);
router.delete('/:id', authenticateToken, eventController.deleteEvent);
router.post('/:id/view', eventController.incrementView);

export default router;
