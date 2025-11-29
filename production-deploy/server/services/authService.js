// Authentication Service - Handles all authentication operations
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db } from '../config/db.js';
import { config } from '../config/env.js';
import { cacheService } from './cacheService.js';

class AuthService {
    constructor() {
        this.jwtSecret = config.JWT_SECRET;
        this.jwtExpiry = config.JWT_EXPIRY || '7d';
    }

    // Generate JWT token
    generateToken(payload) {
        return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiry });
    }

    // Verify JWT token
    verifyToken(token) {
        try {
            return jwt.verify(token, this.jwtSecret);
        } catch (error) {
            throw new Error('Invalid token');
        }
    }

    // Hash password
    async hashPassword(password) {
        const saltRounds = 12;
        return bcrypt.hash(password, saltRounds);
    }

    // Verify password
    async verifyPassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    // Create new user
    async createUser(userData) {
        const { name, email, password, role = 'USER', tier = 'FREE', studioName } = userData;

        return new Promise((resolve, reject) => {
            // Check if user already exists
            db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()], (err, existingUser) => {
                if (err) return reject(new Error('Database error'));
                if (existingUser) return reject(new Error('User already exists'));

                // Hash password
                this.hashPassword(password).then(hashedPassword => {
                    // Create user
                    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const now = new Date().toISOString();

                    const insertQuery = `
                        INSERT INTO users (id, name, email, password, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName)
                        VALUES (?, ?, ?, ?, ?, ?, 0, 100, ?, ?)
                    `;

                    db.run(insertQuery, [userId, name, email.toLowerCase(), hashedPassword, role, tier, now, studioName || null], function(err) {
                        if (err) return reject(new Error('Failed to create user'));

                        // Get created user (without password)
                        db.get('SELECT id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName FROM users WHERE id = ?', [userId], (err, user) => {
                            if (err) return reject(new Error('Failed to retrieve user'));

                            // Generate token
                            const token = this.generateToken({
                                id: user.id,
                                email: user.email,
                                role: user.role
                            });

                            resolve({ user, token });
                        });
                    });
                }).catch(reject);
            });
        });
    }

    // Authenticate user with email/password
    async authenticateUser(email, password) {
        return new Promise((resolve, reject) => {
            console.log('Authenticating user:', email);
            db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], async (err, user) => {
                if (err) {
                    console.error('Database error during auth:', err);
                    return reject(new Error('Database error'));
                }
                if (!user) {
                    console.log('User not found:', email);
                    return reject(new Error('Invalid credentials'));
                }

                console.log('User found:', user.email, 'has password:', !!user.password);

                // Check if user has a password (some users might be Google-only)
                // Allow default admin login for development
                if (!user.password && user.email === 'admin@skytech.mk') {
                    // Create a default admin user on-the-fly for development
                    console.log('Creating on-the-fly admin password');
                    const bcrypt = await import('bcrypt');
                    const hashedPassword = await bcrypt.hash('admin123', 10);
                    // Note: In production, this should be removed and proper admin user creation implemented
                    user.password = hashedPassword;
                    user.role = 'ADMIN';
                    user.tier = 'STUDIO';
                } else if (!user.password) {
                    console.log('User has no password and is not admin');
                    return reject(new Error('Please use Google login for this account'));
                }

                // Verify password
                console.log('Verifying password for:', email);
                const isValidPassword = await this.verifyPassword(password, user.password);
                console.log('Password valid:', isValidPassword);
                if (!isValidPassword) return reject(new Error('Invalid credentials'));

                // Generate token
                const token = this.generateToken({
                    id: user.id,
                    email: user.email,
                    role: user.role
                });

                console.log('Authentication successful for:', email);
                // Return user without password
                const { password: _, ...userWithoutPassword } = user;
                resolve({ user: userWithoutPassword, token });
            });
        });
    }

    // Authenticate with Google (basic implementation)
    async authenticateWithGoogle(credential) {
        return new Promise((resolve, reject) => {
            try {
                console.log('Decoding Google credential...');
                // In a production environment, you would verify the Google JWT token
                // For now, we'll decode it and extract user info
                const decoded = jwt.decode(credential);

                if (!decoded || !decoded.email) {
                    console.log('Invalid Google credential - no email');
                    return reject(new Error('Invalid Google credential'));
                }

                const { email, name, sub: googleId } = decoded;
                console.log('Google user info:', { email, name, googleId });

                // Check if user already exists
                db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], (err, user) => {
                    if (err) {
                        console.error('Database error during Google auth:', err);
                        return reject(new Error('Database error'));
                    }

                    if (!user) {
                        console.log('Creating new Google user:', email);
                        // Create new user from Google data
                        const userId = `user_google_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const now = new Date().toISOString();

                        const insertQuery = `
                            INSERT INTO users (id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate)
                            VALUES (?, ?, ?, 'USER', 'FREE', 0, 100, ?)
                        `;

                        db.run(insertQuery, [userId, name, email.toLowerCase(), now], function(err) {
                            if (err) {
                                console.error('Failed to create Google user:', err);
                                return reject(new Error('Failed to create Google user'));
                            }

                            console.log('Google user created, retrieving...');
                            // Get created user
                            db.get('SELECT id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate FROM users WHERE id = ?', [userId], (err, newUser) => {
                                if (err) {
                                    console.error('Failed to retrieve Google user:', err);
                                    return reject(new Error('Failed to retrieve Google user'));
                                }

                                console.log('Google user retrieved, generating token...');
                                // Generate token - use authService instance instead of this
                                const token = authService.generateToken({
                                    id: newUser.id,
                                    email: newUser.email,
                                    role: newUser.role
                                });

                                console.log('Google authentication successful');
                                resolve({ user: newUser, token });
                            });
                        });
                    } else {
                        console.log('Existing Google user found:', email);
                        // Generate token for existing user
                        const token = authService.generateToken({
                            id: user.id,
                            email: user.email,
                            role: user.role
                        });

                        console.log('Google authentication successful for existing user');
                        resolve({ user, token });
                    }
                });
            } catch (error) {
                console.error('Google authentication error:', error);
                reject(new Error('Google authentication failed'));
            }
        });
    }

    // Validate session token
    async validateSession(token) {
        return new Promise((resolve, reject) => {
            try {
                const decoded = this.verifyToken(token);

                // Check if user still exists
                db.get('SELECT id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName FROM users WHERE id = ?', [decoded.id], (err, user) => {
                    if (err) return reject(new Error('Database error'));
                    if (!user) return reject(new Error('User not found'));

                    resolve(user);
                });
            } catch (error) {
                reject(new Error('Invalid session'));
            }
        });
    }

    // Refresh token (if needed)
    refreshToken(oldToken) {
        try {
            const decoded = this.verifyToken(oldToken);
            // Remove exp and iat from decoded token
            const { exp, iat, ...payload } = decoded;
            return this.generateToken(payload);
        } catch (error) {
            throw new Error('Cannot refresh token');
        }
    }

    // Logout (invalidate token on client side, server-side we rely on expiration)
    async logout(token) {
        // In a more sophisticated setup, we might maintain a blacklist
        // For now, we just return success
        return { success: true };
    }

    // Get user by ID
    getUserById(userId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName FROM users WHERE id = ?', [userId], (err, user) => {
                if (err) reject(err);
                else resolve(user);
            });
        });
    }

    // Update user
    async updateUser(userId, updates) {
        return new Promise(async (resolve, reject) => {
            const allowedFields = ['name', 'email', 'role', 'tier', 'storageUsedMb', 'storageLimitMb', 'studioName'];
            const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

            if (updateFields.length === 0) {
                return reject(new Error('No valid fields to update'));
            }

            const setClause = updateFields.map(field => `${field} = ?`).join(', ');
            const values = updateFields.map(field => updates[field]);
            values.push(userId);

            const updateQuery = `UPDATE users SET ${setClause} WHERE id = ?`;
            db.run(updateQuery, values, async function(err) {
                if (err) return reject(new Error('Failed to update user'));
                if (this.changes === 0) return reject(new Error('User not found'));

                // Invalidate user cache
                await cacheService.invalidateUserEvents(userId);

                // Return updated user
                db.get('SELECT id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName FROM users WHERE id = ?', [userId], (err, user) => {
                    if (err) reject(new Error('Failed to retrieve updated user'));
                    else resolve(user);
                });
            });
        });
    }

    // Delete user
    async deleteUser(userId) {
        return new Promise(async (resolve, reject) => {
            // Check if user exists
            db.get('SELECT id FROM users WHERE id = ?', [userId], async (err, user) => {
                if (err) return reject(new Error('Database error'));
                if (!user) return reject(new Error('User not found'));

                // Delete user's events and media (cascade should handle this)
                db.run('DELETE FROM users WHERE id = ?', [userId], async function(err) {
                    if (err) return reject(new Error('Failed to delete user'));

                    // Invalidate caches
                    await cacheService.invalidateUserEvents(userId);

                    resolve({ success: true });
                });
            });
        });
    }

    // Get all users (admin only)
    getAllUsers() {
        return new Promise((resolve, reject) => {
            db.all('SELECT id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName FROM users ORDER BY joinedDate DESC', [], (err, users) => {
                if (err) reject(err);
                else resolve(users);
            });
        });
    }

    // Middleware for protecting routes
    authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        try {
            const decoded = this.verifyToken(token);
            req.user = decoded;
            next();
        } catch (error) {
            return res.status(403).json({ error: 'Invalid token' });
        }
    }

    // Check if user has required role
    requireRole(requiredRole) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            if (req.user.role !== requiredRole && req.user.role !== 'ADMIN') {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }

            next();
        };
    }

    // Rate limiting helper
    async checkRateLimit(identifier, maxRequests = 100, windowMs = 15 * 60 * 1000) {
        const key = `ratelimit_${identifier}`;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Get current requests in window
        const currentRequests = await cacheService.get(key) || [];

        // Filter out old requests
        const validRequests = currentRequests.filter(timestamp => timestamp > windowStart);

        if (validRequests.length >= maxRequests) {
            return { allowed: false, remaining: 0 };
        }

        // Add current request
        validRequests.push(now);

        // Cache updated requests
        await cacheService.set(key, validRequests, Math.ceil(windowMs / 1000));

        return {
            allowed: true,
            remaining: maxRequests - validRequests.length
        };
    }
}

export const authService = new AuthService();
export default authService;