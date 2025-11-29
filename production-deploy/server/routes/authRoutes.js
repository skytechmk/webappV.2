// Authentication Routes
import express from 'express';
import { login, register, googleLogin, logout, refreshToken, validateSession } from '../controllers/authController.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/register', register);
router.post('/google', googleLogin);
router.post('/refresh', refreshToken);

// Protected routes
router.post('/logout', logout);
router.get('/validate', validateSession);

export default router;
