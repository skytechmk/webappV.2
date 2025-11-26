import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import sqlite3 from 'sqlite3';
const { verbose } = sqlite3;
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs';
import bodyParser from 'body-parser';
import http from 'http';
import { Server } from 'socket.io';
import { spawn } from 'child_process';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import webpush from 'web-push';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { GoogleGenAI } from "@google/genai";
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV === 'production') {
    const requiredVars = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'JWT_SECRET'];
    const missing = requiredVars.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error(`FATAL: Missing required environment variables in production: ${missing.join(', ')}`);
        process.exit(1);
    }
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@skytech.mk';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production';
const JWT_EXPIRY = '7d';

// Email configuration
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || ADMIN_EMAIL;
const SMTP_PASS = process.env.SMTP_PASS || '';

// Email transporter
const emailTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER && SMTP_PASS ? {
        user: SMTP_USER,
        pass: SMTP_PASS
    } : undefined
});

const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['https://snapify.skytech.mk'])
    : (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*');

// MinIO / S3 Config
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://192.168.20.153:9000';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'snapify-media';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'minioadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'minioadmin';

const s3Client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY
    },
    forcePathStyle: true
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  }
});

app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// --- SECURITY: Rate Limiters ---
const RateLimitStore = {
    upload: new Map(),
    pin: new Map(),
    cleanup: setInterval(() => {
        RateLimitStore.upload.clear();
        const now = Date.now();
        for (const [key, data] of RateLimitStore.pin.entries()) {
            if (data.resetTime < now) RateLimitStore.pin.delete(key);
        }
    }, 3600000)
};

const checkRateLimit = (store, key, limit, windowMs) => {
    const now = Date.now();
    let record = store.get(key);
    if (!record || record.resetTime < now) {
        record = { count: 0, resetTime: now + windowMs };
        store.set(key, record);
    }
    if (record.count >= limit) return false;
    record.count++;
    return true;
};

const pinRateLimiter = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(RateLimitStore.pin, ip, 5, 15 * 60 * 1000)) {
        return res.status(429).json({ error: "Too many failed attempts. Please try again in 15 minutes." });
    }
    next();
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
};

const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (!err) req.user = user;
            next();
        });
    } else {
        next();
    }
};

// --- CONCURRENCY CONTROL ---
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

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const dbPath = path.join(__dirname, 'snapify.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('DB Error', err);
    else {
        console.log('Connected to SQLite database');
        db.run("PRAGMA foreign_keys = ON;");
    }
});

// Database Schema
db.serialize(async () => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'USER',
        tier TEXT DEFAULT 'FREE', storageUsedMb REAL DEFAULT 0, storageLimitMb REAL,
        joinedDate TEXT, studioName TEXT, logoUrl TEXT, watermarkOpacity REAL,
        watermarkSize REAL, watermarkPosition TEXT, watermarkOffsetX REAL, watermarkOffsetY REAL
    )`);

    const adminId = 'admin-system-id';
    try {
        const hashedAdminPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        db.run(`INSERT OR IGNORE INTO users (id, name, email, password, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName)
            VALUES (?, ?, ?, ?, 'ADMIN', 'STUDIO', 0, -1, ?, 'System Root')`,
            [adminId, 'System Admin', ADMIN_EMAIL, hashedAdminPassword, new Date().toISOString()]);
    } catch (err) { console.error("Error seeding admin:", err); }

    db.run(`CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, title TEXT, description TEXT, date TEXT, city TEXT, hostId TEXT,
        code TEXT, coverImage TEXT, coverMediaType TEXT, expiresAt TEXT, pin TEXT,
        views INTEGER DEFAULT 0, downloads INTEGER DEFAULT 0,
        FOREIGN KEY(hostId) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY, ownerId TEXT, businessName TEXT, category TEXT, city TEXT,
        description TEXT, contactEmail TEXT, contactPhone TEXT, website TEXT, instagram TEXT,
        coverImage TEXT, isVerified INTEGER DEFAULT 0, createdAt TEXT,
        FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Migrations for existing tables
    db.all("PRAGMA table_info(media)", (err, rows) => {
        if (!rows.some(row => row.name === 'privacy')) db.run("ALTER TABLE media ADD COLUMN privacy TEXT DEFAULT 'public'");
        if (!rows.some(row => row.name === 'uploaderId')) db.run("ALTER TABLE media ADD COLUMN uploaderId TEXT");
    });

    db.run(`CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY, eventId TEXT, type TEXT, url TEXT, previewUrl TEXT,
        isProcessing INTEGER DEFAULT 0, caption TEXT, uploadedAt TEXT, uploaderName TEXT,
        isWatermarked INTEGER, watermarkText TEXT, likes INTEGER DEFAULT 0,
        privacy TEXT DEFAULT 'public', uploaderId TEXT,
        FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS guestbook (
        id TEXT PRIMARY KEY, eventId TEXT, senderName TEXT, message TEXT, createdAt TEXT,
        FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS comments (
         id TEXT PRIMARY KEY, mediaId TEXT, eventId TEXT, senderName TEXT, text TEXT, createdAt TEXT,
         FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE
     )`);

    // Support chat system
    db.run(`CREATE TABLE IF NOT EXISTS support_messages (
         id TEXT PRIMARY KEY,
         userId TEXT,
         userName TEXT,
         userEmail TEXT,
         message TEXT,
         isFromAdmin INTEGER DEFAULT 0,
         isRead INTEGER DEFAULT 0,
         createdAt TEXT,
         FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
     )`);

    // Push notification subscriptions
    db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
         id TEXT PRIMARY KEY,
         userId TEXT,
         subscription TEXT,
         createdAt TEXT,
         FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
     )`);
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 200 * 1024 * 1024 }, // Increased to 200MB for video
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

async function uploadToS3(filePath, key, contentType) {
    try {
        const fileStream = fs.createReadStream(filePath);
        await s3Client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: fileStream, ContentType: contentType }));
        return key;
    } catch (err) {
        throw new Error('Failed to upload media.');
    } finally {
        if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
    }
}

// Track admin online status
const adminOnlineStatus = new Map();

io.on('connection', (socket) => {
    let currentUser = null;

    socket.on('authenticate', (token) => {
        try {
            const user = jwt.verify(token, JWT_SECRET);
            currentUser = user;

            // Track admin status
            if (user.role === 'ADMIN') {
                adminOnlineStatus.set(user.id, { online: true, socketId: socket.id, lastSeen: Date.now() });
                // Notify all users about admin status change
                io.emit('admin_status_update', {
                    adminId: user.id,
                    online: true,
                    lastSeen: Date.now()
                });
                console.log(`Admin ${user.name} (${user.id}) came online`);
            }
        } catch (e) {
            console.error("Authentication failed:", e);
        }
    });

    socket.on('join_event', (eventId) => socket.join(eventId));

    socket.on('admin_trigger_reload', (token) => {
        try {
            const user = jwt.verify(token, JWT_SECRET);
            if (user.role === 'ADMIN') {
                io.emit('force_client_reload', { version: Date.now() });
            }
        } catch (e) { console.error("Unauthorized reload attempt"); }
    });

    socket.on('disconnect', () => {
        if (currentUser && currentUser.role === 'ADMIN') {
            // Mark admin as offline but keep record for some time
            const adminData = adminOnlineStatus.get(currentUser.id);
            if (adminData) {
                adminData.online = false;
                adminData.lastSeen = Date.now();
                // Notify all users about admin going offline
                io.emit('admin_status_update', {
                    adminId: currentUser.id,
                    online: false,
                    lastSeen: Date.now()
                });
                console.log(`Admin ${currentUser.name} (${currentUser.id}) went offline`);
            }
        }
    });
});

app.get('/api/proxy-media', async (req, res) => {
    const { key } = req.query;
    if (!key || typeof key !== 'string') return res.status(400).send("Missing key");
    try {
        const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
        const { Body, ContentType } = await s3Client.send(command);
        if (ContentType) res.setHeader('Content-Type', ContentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        Body.pipe(res);
    } catch (e) { res.status(404).send("Not Found"); }
});

function getPublicUrl(key) { return `/api/proxy-media?key=${encodeURIComponent(key)}`; }

async function attachPublicUrls(mediaList) {
    return mediaList.map(m => ({
        ...m,
        url: getPublicUrl(m.url),
        previewUrl: m.previewUrl ? getPublicUrl(m.previewUrl) : null,
        s3Key: m.url
    }));
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// --- AUTH ROUTES ---
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Required" });
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user || !user.password) return res.status(401).json({ error: "Invalid credentials" });
        try {
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) return res.status(401).json({ error: "Invalid credentials" });
        } catch (bcryptErr) { return res.status(500).json({ error: "Authentication error" }); }

        // Track admin status on login (not just WebSocket)
        if (user.role === 'ADMIN') {
            adminOnlineStatus.set(user.id, {
                online: true,
                lastSeen: Date.now(),
                loginTime: Date.now() // Track login time
            });
            // Notify all users about admin login
            io.emit('admin_status_update', {
                adminId: user.id,
                online: true,
                lastSeen: Date.now()
            });
            console.log(`Admin ${user.name} (${user.id}) logged in`);
        }

        const { password: _, ...safeUser } = user;
        const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
        res.json({ token, user: safeUser });
    });
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
app.post('/api/auth/google', async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Required" });
    try {
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) return res.status(401).json({ error: "Invalid Google token" });
        const { email, name } = payload;
        const normalizedEmail = email.toLowerCase();
        db.get("SELECT * FROM users WHERE lower(email) = ?", [normalizedEmail], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row) {
                const token = jwt.sign({ id: row.id, role: row.role, email: row.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
                return res.json({ token, user: row });
            } else {
                const newId = `user-${Date.now()}`;
                const stmt = db.prepare(`INSERT INTO users (id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
                stmt.run(newId, name, email, 'USER', 'FREE', 0, 100, new Date().toISOString().split('T')[0], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    const token = jwt.sign({ id: newId, role: 'USER', email: email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
                    res.json({ token, user: { id: newId, name, email, role: 'USER', tier: 'FREE', storageUsedMb: 0, storageLimitMb: 100 } });
                });
                stmt.finalize();
            }
        });
    } catch (error) { return res.status(401).json({ error: "Google authentication failed" }); }
});

// --- LOGOUT ---
app.post('/api/auth/logout', authenticateToken, (req, res) => {
    // Mark admin as offline when they explicitly log out
    if (req.user.role === 'ADMIN') {
        const adminData = adminOnlineStatus.get(req.user.id);
        if (adminData) {
            adminData.online = false;
            adminData.lastSeen = Date.now();
            // Notify all users about admin logout
            io.emit('admin_status_update', {
                adminId: req.user.id,
                online: false,
                lastSeen: Date.now()
            });
            console.log(`Admin ${req.user.name} (${req.user.id}) logged out`);
        }
    }

    res.json({ success: true, message: "Logged out successfully" });
});

// --- ADMIN RESET ---
app.post('/api/admin/reset', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Unauthorized" });

    // SECURITY FIX: Disable in production
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: "System reset is disabled in production." });
    }

    const { confirmation } = req.body;
    if (confirmation !== 'RESET_CONFIRM') return res.status(400).json({ error: "Invalid code" });

    try {
        db.serialize(async () => {
            db.run("DELETE FROM comments");
            db.run("DELETE FROM guestbook");
            db.run("DELETE FROM media");
            db.run("DELETE FROM events");
            db.run("DELETE FROM vendors");
            db.run("DELETE FROM users");
            const adminId = 'admin-system-id';
            const hashedAdminPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
            db.run(`INSERT OR IGNORE INTO users (id, name, email, password, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName)
                    VALUES (?, ?, ?, ?, 'ADMIN', 'STUDIO', 0, -1, ?, 'System Root')`,
                    [adminId, 'System Admin', ADMIN_EMAIL, hashedAdminPassword, new Date().toISOString()]);
        });
        fs.readdir(uploadDir, (err, files) => {
            if (!err) { for (const file of files) fs.unlink(path.join(uploadDir, file), () => {}); }
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Reset Error" }); }
});

// --- EVENTS ---
app.get('/api/events', authenticateToken, (req, res) => {
    const query = req.user.role === 'ADMIN'
        ? `SELECT events.*, users.tier as hostTier FROM events JOIN users ON events.hostId = users.id`
        : `SELECT events.*, users.tier as hostTier FROM events JOIN users ON events.hostId = users.id WHERE events.hostId = ?`;
    const params = req.user.role === 'ADMIN' ? [] : [req.user.id];

    db.all(query, params, async (err, events) => {
        if (err) return res.status(500).json({ error: err.message });
        try {
            const detailed = await Promise.all(events.map(async (evt) => {
                const media = await new Promise(resolve => db.all("SELECT * FROM media WHERE eventId = ? ORDER BY uploadedAt DESC", [evt.id], (err, rows) => resolve(rows || [])));
                const signedMedia = await attachPublicUrls(media);
                let signedCover = evt.coverImage;
                if (evt.coverImage && !evt.coverImage.startsWith('http')) signedCover = getPublicUrl(evt.coverImage);
                return { ...evt, media: signedMedia, coverImage: signedCover, hasPin: !!evt.pin };
            }));
            res.json(detailed);
        } catch (e) { res.status(500).json({ error: 'Failed' }); }
    });
});

app.get('/api/events/:id', async (req, res) => {
    db.get(`SELECT events.*, users.tier as hostTier FROM events LEFT JOIN users ON events.hostId = users.id WHERE events.id = ?`, [req.params.id], async (err, evt) => {
        if (err || !evt) return res.status(404).json({ error: "Not found" });
        // Check if event has expired
        if (evt.expiresAt && new Date(evt.expiresAt) < new Date()) {
            return res.status(410).json({ error: "Event expired" });
        }
        const media = await new Promise(resolve => db.all("SELECT * FROM media WHERE eventId = ? ORDER BY uploadedAt DESC", [evt.id], (err, rows) => resolve(rows || [])));
        const signedMedia = await attachPublicUrls(media);
        let signedCover = evt.coverImage;
        if (evt.coverImage && !evt.coverImage.startsWith('http')) signedCover = getPublicUrl(evt.coverImage);

        // Guestbook
        const guestbook = await new Promise(resolve => db.all("SELECT * FROM guestbook WHERE eventId = ? ORDER BY createdAt DESC", [evt.id], (err, rows) => resolve(rows || [])));

        res.json({ ...evt, media: signedMedia, guestbook, coverImage: signedCover, hasPin: !!evt.pin, pin: undefined }); // Hide PIN
    });
});

app.post('/api/events', authenticateToken, (req, res) => {
    const e = req.body;
    if (e.hostId !== req.user.id && req.user.role !== 'ADMIN') return res.sendStatus(403);
    const stmt = db.prepare(`INSERT INTO events (id, title, description, date, city, hostId, code, expiresAt, pin, views, downloads) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(e.id, e.title, e.description, e.date, e.city || null, e.hostId, e.code, e.expiresAt, e.pin, 0, 0, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(e);
    });
    stmt.finalize();
});

// FIX: Dynamic PATCH update for events
app.put('/api/events/:id', authenticateToken, (req, res) => {
    const updates = req.body;
    const allowedFields = ['title', 'description', 'coverImage', 'coverMediaType', 'expiresAt', 'downloads'];

    db.get("SELECT hostId FROM events WHERE id = ?", [req.params.id], (err, row) => {
        if (!row) return res.status(404).json({ error: "Not found" });
        if (row.hostId !== req.user.id && req.user.role !== 'ADMIN') return res.sendStatus(403);

        const fieldsToUpdate = Object.keys(updates).filter(key => allowedFields.includes(key));
        if (fieldsToUpdate.length === 0) return res.json({ success: true }); // Nothing to update

        const setClause = fieldsToUpdate.map(field => `${field} = ?`).join(', ');
        const values = fieldsToUpdate.map(field => updates[field]);
        values.push(req.params.id);

        db.run(`UPDATE events SET ${setClause} WHERE id = ?`, values, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// FIX: Atomic View Increment
app.post('/api/events/:id/view', (req, res) => {
    db.run("UPDATE events SET views = views + 1 WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/events/:id', authenticateToken, (req, res) => {
    db.get("SELECT hostId FROM events WHERE id = ?", [req.params.id], (err, row) => {
        if (!row) return res.status(404).json({ error: "Not found" });
        if (row.hostId !== req.user.id && req.user.role !== 'ADMIN') return res.sendStatus(403);
        db.run("DELETE FROM events WHERE id=?", req.params.id, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// --- MEDIA UPLOAD (FIXED SECURITY & STABILITY) ---
app.post('/api/media', optionalAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const body = req.body;
    let uploaderId = body.uploaderId;

    // 1. Identity Check
    if (req.user) {
        if (uploaderId !== req.user.id) return res.status(403).json({ error: "Identity mismatch" });
    } else {
        if (!uploaderId || !uploaderId.startsWith('guest-')) uploaderId = `guest-anon-${Date.now()}`;
    }

    // 2. Server-Side Storage Quota Enforcement
    if (req.user) {
        try {
            const user = await new Promise((resolve, reject) => {
                db.get("SELECT storageUsedMb, storageLimitMb FROM users WHERE id = ?", [req.user.id], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });

            if (user) {
                const fileSizeMb = req.file.size / (1024 * 1024);
                // Allow unlimited if limit is -1
                if (user.storageLimitMb !== -1 && (user.storageUsedMb + fileSizeMb > user.storageLimitMb)) {
                    fs.unlink(req.file.path, () => {}); // Delete temp file
                    return res.status(413).json({ error: "Storage limit exceeded" });
                }

                // Update usage immediately (pending success)
                db.run("UPDATE users SET storageUsedMb = storageUsedMb + ? WHERE id = ?", [fileSizeMb, req.user.id]);
                // Notify client of new usage
                io.emit('user_updated', { id: req.user.id, storageUsedMb: user.storageUsedMb + fileSizeMb });
            }
        } catch (e) {
            console.error("Quota check error", e);
            return res.status(500).json({ error: "Internal server error during quota check" });
        }
    }

    const isVideo = body.type === 'video';
    const ext = path.extname(req.file.originalname);
    const s3Key = `events/${body.eventId}/${body.id}${ext}`;
    const stmt = db.prepare(`INSERT INTO media (id, eventId, type, url, previewUrl, isProcessing, caption, uploadedAt, uploaderName, uploaderId, isWatermarked, watermarkText, likes, privacy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    if (!isVideo) {
        try {
            const previewFilename = `thumb_${path.parse(req.file.filename).name}.jpg`;
            const previewPath = path.join(uploadDir, previewFilename);
            const previewKey = `events/${body.eventId}/thumb_${body.id}.jpg`;

            await sharp(req.file.path).resize(400, 400, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(previewPath);
            await Promise.all([uploadToS3(req.file.path, s3Key, req.file.mimetype), uploadToS3(previewPath, previewKey, 'image/jpeg')]);

            fs.unlink(previewPath, () => {});

            stmt.run(body.id, body.eventId, body.type, s3Key, previewKey, 0, body.caption, body.uploadedAt, body.uploaderName, uploaderId, body.isWatermarked === 'true' ? 1 : 0, body.watermarkText, 0, body.privacy || 'public', (err) => {
                const item = { id: body.id, eventId: body.eventId, url: getPublicUrl(s3Key), previewUrl: getPublicUrl(previewKey), type: body.type, caption: body.caption, isProcessing: false, uploadedAt: body.uploadedAt, uploaderName: body.uploaderName, likes: 0, comments: [], privacy: body.privacy || 'public', uploaderId };
                io.to(body.eventId).emit('media_uploaded', item);
                res.json(item);
            });
            stmt.finalize();
        } catch (e) { res.status(500).json({ error: e.message }); }
    } else {
        // Video Handling with Queue and Failure Safety
        stmt.run(body.id, body.eventId, body.type, s3Key, '', 1, body.caption, body.uploadedAt, body.uploaderName, uploaderId, body.isWatermarked === 'true' ? 1 : 0, body.watermarkText, 0, body.privacy || 'public', (err) => {
            const item = { id: body.id, eventId: body.eventId, url: '', type: body.type, caption: body.caption, isProcessing: true, uploadedAt: body.uploadedAt, uploaderName: body.uploaderName, likes: 0, comments: [], privacy: body.privacy || 'public', uploaderId };
            io.to(body.eventId).emit('media_uploaded', item);
            res.json(item);

            // Add to Queue
            videoQueue.add(async () => {
                const inputPath = req.file.path;
                if (!inputPath.startsWith(uploadDir)) return;
                const outputPath = path.join(uploadDir, `preview_${path.parse(req.file.filename).name}.mp4`);
                const previewKey = `events/${body.eventId}/preview_${body.id}.mp4`;

                return new Promise((resolve) => {
                    const ffmpeg = spawn('ffmpeg', ['-i', inputPath, '-vf', 'scale=-2:720', '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k', '-y', outputPath]);

                    ffmpeg.on('close', async (code) => {
                        if (code === 0) {
                            try {
                                await Promise.all([uploadToS3(inputPath, s3Key, req.file.mimetype), uploadToS3(outputPath, previewKey, 'video/mp4')]);
                                db.run("UPDATE media SET isProcessing = 0, previewUrl = ? WHERE id = ?", [previewKey, body.id], () => {
                                    io.to(body.eventId).emit('media_processed', { id: body.id, previewUrl: getPublicUrl(previewKey), url: getPublicUrl(s3Key) });
                                });
                            } catch (e) { console.error("S3 Upload failed for video", e); }
                        } else {
                            // Failure cleanup
                            console.error(`FFmpeg failed with code ${code}`);
                            db.run("DELETE FROM media WHERE id = ?", [body.id]); // Or mark as error
                        }
                        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                        resolve();
                    });

                    ffmpeg.on('error', (err) => {
                        console.error("FFmpeg Spawn Error", err);
                        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                        db.run("DELETE FROM media WHERE id = ?", [body.id]);
                        resolve();
                    });
                });
            });
        });
        stmt.finalize();
    }
});

app.delete('/api/media/:id', authenticateToken, (req, res) => {
    db.get(`SELECT media.url, media.previewUrl, events.hostId, media.uploaderId FROM media JOIN events ON media.eventId = events.id WHERE media.id = ?`, [req.params.id], async (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Not found" });
        // Allow Admin, Event Host, or Original Uploader to delete
        if (req.user.role !== 'ADMIN' && row.hostId !== req.user.id && row.uploaderId !== req.user.id) return res.sendStatus(403);
        try {
            if (row.url) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.url }));
            if (row.previewUrl) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.previewUrl }));
        } catch (e) {}
        db.run("DELETE FROM media WHERE id = ?", req.params.id, (err) => res.json({ success: true }));
    });
});

app.post('/api/media/bulk-delete', authenticateToken, async (req, res) => {
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
                if (row.url) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.url }));
                if (row.previewUrl) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.previewUrl }));
                await new Promise((resolve) => db.run("DELETE FROM media WHERE id = ?", [row.id], () => { deletedCount++; resolve(true); }));
            } catch (e) {}
        });
        await Promise.all(deletePromises);
        res.json({ success: true, deletedCount });
    });
});

// --- USER MANAGEMENT (SECURED) ---
app.get('/api/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    db.all("SELECT * FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/users/:id', authenticateToken, (req, res) => {
    const isSelf = req.user.id === req.params.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isSelf && !isAdmin) return res.sendStatus(403);

    const { name, email, studioName, logoUrl, watermarkOpacity, watermarkSize, watermarkPosition, watermarkOffsetX, watermarkOffsetY, role, tier, storageLimitMb } = req.body;

    // Get current user tier to check branding permissions
    db.get("SELECT tier FROM users WHERE id = ?", [req.params.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: "User not found" });

        const currentTier = user.tier;
        const tierConfig = {
            FREE: { allowBranding: false },
            BASIC: { allowBranding: false },
            PRO: { allowBranding: true },
            STUDIO: { allowBranding: true }
        };

        const canUseBranding = tierConfig[currentTier]?.allowBranding || false;

        // Clear branding fields if tier doesn't allow them
        const safeStudioName = canUseBranding ? studioName : null;
        const safeLogoUrl = canUseBranding ? logoUrl : null;
        const safeWatermarkOpacity = canUseBranding ? watermarkOpacity : null;
        const safeWatermarkSize = canUseBranding ? watermarkSize : null;
        const safeWatermarkPosition = canUseBranding ? watermarkPosition : null;
        const safeWatermarkOffsetX = canUseBranding ? watermarkOffsetX : null;
        const safeWatermarkOffsetY = canUseBranding ? watermarkOffsetY : null;

        // 1. Safe Update (Self or Admin)
        let sql = "UPDATE users SET name=?, studioName=?, logoUrl=?, watermarkOpacity=?, watermarkSize=?, watermarkPosition=?, watermarkOffsetX=?, watermarkOffsetY=? WHERE id=?";
        let params = [name, safeStudioName, safeLogoUrl, safeWatermarkOpacity, safeWatermarkSize, safeWatermarkPosition, safeWatermarkOffsetX, safeWatermarkOffsetY, req.params.id];

        // 2. Privileged Update (Admin Only)
        if (isAdmin) {
            sql = "UPDATE users SET name=?, email=?, role=?, tier=?, storageUsedMb=?, storageLimitMb=?, studioName=?, logoUrl=?, watermarkOpacity=?, watermarkSize=?, watermarkPosition=?, watermarkOffsetX=?, watermarkOffsetY=? WHERE id=?";
            params = [name, email, role, tier, req.body.storageUsedMb, storageLimitMb, safeStudioName, safeLogoUrl, safeWatermarkOpacity, safeWatermarkSize, safeWatermarkPosition, safeWatermarkOffsetX, safeWatermarkOffsetY, req.params.id];
        }

        db.run(sql, params, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            const u = req.body;
            io.emit('user_updated', u);
            res.json({ success: true });
        });
    });
});

app.put('/api/users/:id/upgrade', authenticateToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);

    const { tier } = req.body;
    if (!tier || !['FREE', 'BASIC', 'PRO', 'STUDIO'].includes(tier)) {
        return res.status(400).json({ error: "Invalid tier" });
    }

    // Update user tier
    db.run("UPDATE users SET tier = ? WHERE id = ?", [tier, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        if (this.changes === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        // Get updated user info
        db.get("SELECT * FROM users WHERE id = ?", [req.params.id], (err, user) => {
            if (err) return res.status(500).json({ error: err.message });

            // Emit user update to all clients
            io.emit('user_updated', user);

            res.json({
                success: true,
                message: `User upgraded to ${tier} successfully`,
                user: user
            });
        });
    });
});

app.delete('/api/users/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    db.all("SELECT url, previewUrl FROM media WHERE eventId IN (SELECT id FROM events WHERE hostId = ?)", [req.params.id], async (err, rows) => {
        if (!err && rows) {
            for (const row of rows) {
                try {
                    if (row.url) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.url }));
                    if (row.previewUrl) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.previewUrl }));
                } catch (e) {}
            }
        }
        db.run("DELETE FROM users WHERE id = ?", req.params.id, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// Other misc routes (Guestbook, Comments, Vendors) remain as they were, they are generally low risk or already correct.
// Re-adding vendor route for completeness
app.get('/api/vendors', (req, res) => {
    const { city } = req.query;
    let query = "SELECT * FROM vendors";
    const params = [];
    if (city) { query += " WHERE lower(city) = ?"; params.push(city.toString().toLowerCase()); }
    query += " ORDER BY RANDOM() LIMIT 5";
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/guestbook', async (req, res) => {
    const { eventId, senderName, message, createdAt } = req.body;
    const id = crypto.randomUUID();
    db.run("INSERT INTO guestbook (id, eventId, senderName, message, createdAt) VALUES (?, ?, ?, ?, ?)", [id, eventId, senderName, message, createdAt], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        const entry = { id, eventId, senderName, message, createdAt };
        io.to(eventId).emit('new_message', entry);
        res.json(entry);
    });
});

app.post('/api/comments', async (req, res) => {
    const { mediaId, eventId, senderName, text, createdAt } = req.body;
    const id = crypto.randomUUID();
    db.run("INSERT INTO comments (id, mediaId, eventId, senderName, text, createdAt) VALUES (?, ?, ?, ?, ?, ?)", [id, mediaId, eventId, senderName, text, createdAt], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        const comment = { id, mediaId, eventId, senderName, text, createdAt };
        io.to(eventId).emit('new_comment', comment);
        res.json(comment);
    });
});

app.post('/api/events/:id/validate-pin', pinRateLimiter, (req, res) => {
    const { pin } = req.body;
    db.get("SELECT pin FROM events WHERE id = ?", [req.params.id], (err, row) => {
        if (!row) return res.status(404).json({ error: "Not found" });
        res.json({ success: !row.pin || row.pin === pin });
    });
});

// --- SYSTEM STORAGE MONITORING ---
app.get('/api/system/storage', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Unauthorized" });

    try {
        // Get system disk usage
        const systemDf = await new Promise((resolve, reject) => {
            const df = spawn('df', ['-h', '/']);
            let output = '';
            df.stdout.on('data', (data) => output += data.toString());
            df.stderr.on('data', (data) => output += data.toString());
            df.on('close', (code) => {
                if (code === 0) {
                    const lines = output.trim().split('\n');
                    if (lines.length >= 2) {
                        const parts = lines[1].split(/\s+/);
                        resolve({
                            filesystem: parts[0],
                            size: parts[1],
                            used: parts[2],
                            available: parts[3],
                            usePercent: parts[4]
                        });
                    } else {
                        reject(new Error('Invalid df output'));
                    }
                } else {
                    reject(new Error(`df failed with code ${code}`));
                }
            });
            df.on('error', reject);
        });

        // Get MinIO filesystem info (df)
        const minioDf = await new Promise((resolve, reject) => {
            const ssh = spawn('sshpass', ['-p', 'jarvis', 'ssh', '-o', 'StrictHostKeyChecking=no', 'root@192.168.20.153', 'df -h /mnt/data']);
            let output = '';
            ssh.stdout.on('data', (data) => output += data.toString());
            ssh.stderr.on('data', (data) => output += data.toString());
            ssh.on('close', (code) => {
                if (code === 0) {
                    const lines = output.trim().split('\n');
                    if (lines.length >= 2) {
                        const parts = lines[1].split(/\s+/);
                        resolve({
                            filesystem: parts[0],
                            size: parts[1],
                            used: parts[2],
                            available: parts[3],
                            usePercent: parts[4]
                        });
                    } else {
                        reject(new Error('Invalid remote df output'));
                    }
                } else {
                    reject(new Error(`SSH df failed with code ${code}: ${output}`));
                }
            });
            ssh.on('error', reject);
        });

        res.json({
            system: systemDf,
            minio: minioDf,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Storage monitoring error:', error);
        res.status(500).json({ error: 'Failed to retrieve storage information' });
    }
});

// --- UPGRADE REQUESTS ---
app.post('/api/upgrade-request', optionalAuth, async (req, res) => {
    const { tier, message, contactMethod } = req.body;

    if (!tier) return res.status(400).json({ error: "Tier is required" });

    // Get user info if authenticated
    let userInfo = null;
    if (req.user) {
        userInfo = await new Promise((resolve) => {
            db.get("SELECT id, name, email, tier as currentTier FROM users WHERE id = ?", [req.user.id], (err, row) => {
                resolve(row || null);
            });
        });
    }

    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Send email notification to admin
    try {
        const tierNames = {
            'FREE': 'Free',
            'BASIC': 'Basic',
            'PRO': 'Pro',
            'STUDIO': 'Studio'
        };

        const emailSubject = `SnapifY Upgrade Request - ${tierNames[tier] || tier}`;
        const emailBody = `
New upgrade request received:

Request ID: ${requestId}
Timestamp: ${timestamp}
Requested Tier: ${tierNames[tier] || tier}

${userInfo ? `User Information:
Name: ${userInfo.name}
Email: ${userInfo.email}
Current Tier: ${userInfo.currentTier}
User ID: ${req.user.id}

` : 'Anonymous Request\n'}

Contact Method: ${contactMethod || 'Not specified'}
${message ? `Additional Message: ${message}` : ''}

Please review and process this upgrade request.
        `;

        if (SMTP_USER && SMTP_PASS) {
            await emailTransporter.sendMail({
                from: SMTP_USER,
                to: ADMIN_EMAIL,
                subject: emailSubject,
                text: emailBody
            });
            console.log(`Upgrade request email sent to ${ADMIN_EMAIL}`);
        } else {
            console.warn('SMTP not configured, skipping email notification');
        }
    } catch (emailError) {
        console.error('Failed to send upgrade request email:', emailError);
        // Don't fail the request if email fails
    }

    // Send real-time notification to all admin users
    try {
        // Get all admin users
        const adminUsers = await new Promise((resolve) => {
            db.all("SELECT id FROM users WHERE role = 'ADMIN'", [], (err, rows) => {
                resolve(rows || []);
            });
        });

        const notification = {
            type: 'upgrade_request',
            id: requestId,
            tier: tier,
            timestamp: timestamp,
            userInfo: userInfo,
            message: message,
            contactMethod: contactMethod
        };

        // Emit to all admin users
        adminUsers.forEach(admin => {
            io.to(`admin_${admin.id}`).emit('admin_notification', notification);
        });

        // Also emit globally for admins
        io.emit('upgrade_request', notification);

    } catch (socketError) {
        console.error('Failed to send real-time notification:', socketError);
    }

    res.json({
        success: true,
        requestId: requestId,
        message: 'Upgrade request submitted successfully. An administrator will contact you soon.'
    });
});

// --- ADMIN STATUS ---
app.get('/api/admin/status', (req, res) => {
    // Get all admin users from database
    db.all("SELECT id, name FROM users WHERE role = 'ADMIN'", [], (err, adminUsers) => {
        if (err) return res.status(500).json({ error: err.message });

        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000); // 1 hour ago

        const adminStatus = adminUsers.map(admin => {
            const wsStatus = adminOnlineStatus.get(admin.id);

            // Consider admin online if:
            // 1. WebSocket connection is active, OR
            // 2. Logged in within the last hour
            const isOnline = Boolean((wsStatus && wsStatus.online) ||
                           (wsStatus && wsStatus.loginTime && wsStatus.loginTime > oneHourAgo));


            return {
                adminId: admin.id,
                online: isOnline,
                lastSeen: wsStatus ? wsStatus.lastSeen : (wsStatus && wsStatus.loginTime ? wsStatus.loginTime : now),
                name: admin.name
            };
        });

        res.json({ admins: adminStatus });
    });
});

// --- SUPPORT CHAT ---
app.get('/api/support/messages', authenticateToken, (req, res) => {
    const { limit = 50, offset = 0 } = req.query;

    let query, params;
    if (req.user.role === 'ADMIN') {
        // Admin sees all conversations
        query = `SELECT * FROM support_messages ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
        params = [parseInt(limit), parseInt(offset)];
    } else {
        // Users see only their own messages
        query = `SELECT * FROM support_messages WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
        params = [req.user.id, parseInt(limit), parseInt(offset)];
    }

    db.all(query, params, (err, messages) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(messages.reverse()); // Return in chronological order
    });
});

app.post('/api/support/messages', optionalAuth, (req, res) => {
    const { message } = req.body;
    if (!message || message.trim().length === 0) return res.status(400).json({ error: "Message is required" });

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    let userId = null;
    let userName = 'Anonymous User';
    let userEmail = null;

    if (req.user) {
        userId = req.user.id;
        userName = req.user.name;
        userEmail = req.user.email;
    }

    // Check if any admin is online
    const onlineAdmins = Array.from(adminOnlineStatus.values()).filter(admin => admin.online);

    db.run(`INSERT INTO support_messages (id, userId, userName, userEmail, message, isFromAdmin, createdAt)
            VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [id, userId, userName, userEmail, message.trim(), createdAt], async (err) => {
        if (err) return res.status(500).json({ error: err.message });

        const newMessage = {
            id,
            userId,
            userName,
            userEmail,
            message: message.trim(),
            isFromAdmin: false,
            isRead: false,
            createdAt
        };

        // Emit to all admin users
        io.emit('new_support_message', newMessage);

        // Send push notifications to offline admins
        if (onlineAdmins.length === 0) {
          try {
            // Send push notification to all admin users
            const adminUsers = await new Promise((resolve) => {
              db.all("SELECT id FROM users WHERE role = 'ADMIN'", [], (err, rows) => {
                resolve(rows || []);
              });
            });

            for (const admin of adminUsers) {
              await sendPushNotification(admin.id, 'New Support Message',
                `${userName}: ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`,
                { type: 'support_message', userId: userId, messageId: id });
            }
          } catch (pushError) {
            console.error('Failed to send push notifications:', pushError);
          }
        }

        // If no admin is online, send automated response
        if (onlineAdmins.length === 0) {
            setTimeout(() => {
                const autoResponseId = crypto.randomUUID();
                const autoResponse = {
                    id: autoResponseId,
                    userId: userId,
                    userName: 'SnapifY Support',
                    userEmail: null,
                    message: "Thank you for your message! Our administrator is currently offline but will respond as soon as possible. For urgent matters, please email support@snapify.mk",
                    isFromAdmin: true,
                    isRead: false,
                    createdAt: new Date().toISOString()
                };

                db.run(`INSERT INTO support_messages (id, userId, userName, userEmail, message, isFromAdmin, createdAt)
                        VALUES (?, ?, ?, ?, ?, 1, ?)`,
                    [autoResponseId, userId, 'SnapifY Support', null, autoResponse.message, autoResponse.createdAt], (err) => {
                    if (!err) {
                        io.emit('new_support_message', autoResponse);
                    }
                });
            }, 2000); // 2 second delay for automated response
        }

        res.json(newMessage);
    });
});

app.post('/api/support/admin-reply', authenticateToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Unauthorized" });

    const { userId, message } = req.body;
    if (!userId || !message || message.trim().length === 0) {
        return res.status(400).json({ error: "User ID and message are required" });
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    db.run(`INSERT INTO support_messages (id, userId, userName, userEmail, message, isFromAdmin, isRead, createdAt)
            VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
        [id, userId, req.user.name, req.user.email, message.trim(), createdAt], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        const replyMessage = {
            id,
            userId,
            userName: req.user.name,
            userEmail: req.user.email,
            message: message.trim(),
            isFromAdmin: true,
            isRead: true,
            createdAt
        };

        // Emit to the specific user and all admins
        io.emit('new_support_message', replyMessage);

        res.json(replyMessage);
    });
});

app.put('/api/support/messages/:id/read', authenticateToken, (req, res) => {
    const messageId = req.params.id;

    // Get message to check ownership
    db.get("SELECT userId, isFromAdmin FROM support_messages WHERE id = ?", [messageId], (err, message) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!message) return res.status(404).json({ error: "Message not found" });

        // Allow admin to mark any message as read, users can only mark their own admin messages
        const canMarkRead = req.user.role === 'ADMIN' ||
                           (message.userId === req.user.id && message.isFromAdmin);

        if (!canMarkRead) return res.status(403).json({ error: "Unauthorized" });

        db.run("UPDATE support_messages SET isRead = 1 WHERE id = ?", [messageId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// --- PUSH NOTIFICATIONS ---
app.post('/api/push/subscribe', authenticateToken, (req, res) => {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: "Subscription is required" });

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // Remove any existing subscription for this user
    db.run("DELETE FROM push_subscriptions WHERE userId = ?", [req.user.id], () => {
        db.run(`INSERT INTO push_subscriptions (id, userId, subscription, createdAt)
                VALUES (?, ?, ?, ?)`,
            [id, req.user.id, JSON.stringify(subscription), createdAt], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// Function to send push notification
async function sendPushNotification(userId, title, body, data = {}) {
    try {
        const subscriptions = await new Promise((resolve) => {
            db.all("SELECT subscription FROM push_subscriptions WHERE userId = ?", [userId], (err, rows) => {
                resolve(rows || []);
            });
        });

        const notifications = subscriptions.map(sub => {
            const subscription = JSON.parse(sub.subscription);
            return webpush.sendNotification(subscription, JSON.stringify({
                title,
                body,
                icon: '/pwa-192x192.png',
                badge: '/pwa-192x192.png',
                data
            }));
        });

        await Promise.allSettled(notifications);
        console.log(`Push notification sent to ${subscriptions.length} devices for user ${userId}`);
    } catch (error) {
        console.error('Push notification failed:', error);
    }
}

// Configure web push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:' + ADMIN_EMAIL,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn('VAPID keys not configured, push notifications disabled');
}

// --- AI ROUTES ---
app.post('/api/ai/generate-caption', optionalAuth, async (req, res) => {
    const { base64Image } = req.body;
    if (!base64Image) return res.status(400).json({ error: "Image required" });

    try {
        const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = "Generate a short, engaging caption for this photo from an event. Keep it under 50 characters.";
        const result = await model.generateContent([prompt, { inlineData: { mimeType: "image/jpeg", data: base64Image } }]);
        const caption = result.response.text().trim();

        res.json({ caption });
    } catch (error) {
        console.error("AI Caption Error:", error);
        res.status(500).json({ error: "Failed to generate caption" });
    }
});

app.post('/api/ai/generate-event-description', optionalAuth, async (req, res) => {
    const { title, date, type } = req.body;
    if (!title || !date || !type) return res.status(400).json({ error: "Title, date, and type required" });

    try {
        const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Generate a short, engaging event description for: ${title} on ${date}, type: ${type}. Keep it under 100 characters.`;
        const result = await model.generateContent(prompt);
        const description = result.response.text().trim();

        res.json({ description });
    } catch (error) {
        console.error("AI Description Error:", error);
        res.status(500).json({ error: "Failed to generate description" });
    }
});

app.post('/api/ai/generate-guest-reviews', optionalAuth, async (req, res) => {
    const { country, language, count = 6 } = req.body;
    if (!country || !language) return res.status(400).json({ error: "Country and language required" });

    try {
        const genAI = new GoogleGenAI(process.env.GOOGLE_AI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Generate ${count} diverse, authentic guest feedback reviews for a web app called Snapify, an event-sharing platform. The reviews should be from users in ${country}, written in ${language}, and reflect local cultural contexts, experiences, and perspectives.

Requirements:
- Mix of positive, neutral, and constructive criticism tones
- Varied lengths (short to medium)
- Include subtle references to local customs, cuisine, traditions, or events relevant to ${country}
- Use colloquial language and varied formality levels
- Make them feel genuine and realistic
- Each review should be in ${language}

Return the reviews as a JSON array of objects, each with:
- "review": the review text in ${language}
- "translation": English translation if not English
- "tone": "positive", "neutral", or "constructive"
- "rationale": brief explanation of realism

Example structure:
[
  {
    "review": "Review text here",
    "translation": "English translation",
    "tone": "positive",
    "rationale": "Reflects local culture..."
  }
]`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        // Try to parse the JSON response
        let reviews;
        try {
            reviews = JSON.parse(responseText);
        } catch (parseError) {
            // If parsing fails, try to extract JSON from the response
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                reviews = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("Invalid JSON response from AI");
            }
        }

        res.json({ reviews });
    } catch (error) {
        console.error("AI Reviews Error:", error);
        res.status(500).json({ error: "Failed to generate reviews" });
    }
});

server.listen(PORT, () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});