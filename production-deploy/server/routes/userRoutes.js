import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticateToken } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.get('/', apiLimiter, authenticateToken, userController.getUsers);
router.put('/:id', authenticateToken, userController.updateUser);
router.put('/:id/upgrade', authenticateToken, userController.upgradeUser);
router.delete('/:id', authenticateToken, userController.deleteUser);

export default router;
