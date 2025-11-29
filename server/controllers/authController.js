// Authentication Controller - Handles auth-related HTTP requests
import { authService } from '../services/authService.js';
import { logger } from '../services/loggerService.js';
import { monitoring } from '../services/monitoringService.js';

export const login = async (req, res) => {
    const startTime = Date.now();
    const clientIP = req.ip;
    const userAgent = req.get('User-Agent');

    try {
        const { email, password } = req.body;
        logger.authEvent('login_attempt', null, true, {
            email: email.toLowerCase(),
            ip: clientIP,
            userAgent
        });

        if (!email || !password) {
            logger.authEvent('login_failed', null, false, {
                reason: 'missing_credentials',
                ip: clientIP
            });
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const result = await authService.authenticateUser(email, password);

        logger.authEvent('login_success', result.user.id, true, {
            email: email.toLowerCase(),
            ip: clientIP,
            duration: Date.now() - startTime
        });

        res.json(result);
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.authEvent('login_failed', null, false, {
            error: error.message,
            email: req.body.email?.toLowerCase(),
            ip: clientIP,
            duration
        });

        monitoring.captureException(error, {
            type: 'auth_login_error',
            email: req.body.email?.toLowerCase(),
            ip: clientIP,
            duration
        });

        res.status(401).json({ error: error.message });
    }
};

export const googleLogin = async (req, res) => {
    const startTime = Date.now();
    const clientIP = req.ip;
    const userAgent = req.get('User-Agent');

    try {
        const { credential } = req.body;
        logger.authEvent('google_login_attempt', null, true, {
            ip: clientIP,
            userAgent,
            hasCredential: !!credential
        });

        if (!credential) {
            logger.authEvent('google_login_failed', null, false, {
                reason: 'no_credential',
                ip: clientIP
            });
            return res.status(400).json({ error: 'Google credential is required' });
        }

        const result = await authService.authenticateWithGoogle(credential);

        logger.authEvent('google_login_success', result.user.id, true, {
            email: result.user.email,
            ip: clientIP,
            duration: Date.now() - startTime
        });

        res.json(result);
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.authEvent('google_login_failed', null, false, {
            error: error.message,
            ip: clientIP,
            duration
        });

        monitoring.captureException(error, {
            type: 'auth_google_login_error',
            ip: clientIP,
            duration
        });

        res.status(401).json({ error: error.message });
    }
};

export const register = async (req, res) => {
    const startTime = Date.now();
    const clientIP = req.ip;

    try {
        const { name, email, password, isPhotographer, studioName } = req.body;

        if (!name || !email || !password) {
            logger.authEvent('registration_failed', null, false, {
                reason: 'missing_fields',
                ip: clientIP
            });
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        const role = isPhotographer ? 'PHOTOGRAPHER' : 'USER';
        const result = await authService.createUser({
            name,
            email,
            password,
            role,
            studioName
        });

        logger.authEvent('registration_success', result.user.id, true, {
            email: email.toLowerCase(),
            role,
            ip: clientIP,
            duration: Date.now() - startTime
        });

        res.status(201).json(result);
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.authEvent('registration_failed', null, false, {
            error: error.message,
            email: req.body.email?.toLowerCase(),
            ip: clientIP,
            duration
        });

        monitoring.captureException(error, {
            type: 'auth_registration_error',
            email: req.body.email?.toLowerCase(),
            ip: clientIP,
            duration
        });

        res.status(400).json({ error: error.message });
    }
};

export const logout = async (req, res) => {
    try {
        // Get token from header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            await authService.logout(token);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
};

export const refreshToken = async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const oldToken = authHeader && authHeader.split(' ')[1];

        if (!oldToken) {
            return res.status(401).json({ error: 'Token required' });
        }

        const newToken = authService.refreshToken(oldToken);
        res.json({ token: newToken });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ error: 'Token refresh failed' });
    }
};

export const validateSession = async (req, res) => {
    try {
        const user = await authService.validateSession(req.user.id);
        res.json({ user });
    } catch (error) {
        console.error('Session validation error:', error);
        res.status(401).json({ error: 'Invalid session' });
    }
};

// Middleware exports
export const authenticateToken = authService.authenticateToken.bind(authService);
export const requireRole = authService.requireRole.bind(authService);
