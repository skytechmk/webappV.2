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
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';

// Helper function to extract EXIF orientation from image
const getImageOrientation = async (filePath) => {
    try {
        const metadata = await sharp(filePath).metadata();
        return metadata.orientation || 1; // Default to 1 (normal) if no orientation
    } catch (error) {
        console.warn('Failed to extract EXIF orientation:', error);
        return 1; // Default orientation
    }
};
import webpush from 'web-push'; 
import bcrypt from 'bcrypt'; 
import { OAuth2Client } from 'google-auth-library'; 
import { GoogleGenAI } from "@google/genai"; 
import crypto from 'crypto'; // Added for randomUUID

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3001;

// SECURITY FIX: Strict Environment Check
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

// Domain Management
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

// Web Push Configuration
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BPhZ...placeholder...',
  privateKey: process.env.VAPID_PRIVATE_KEY || '...placeholder...'
};

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      'mailto:' + ADMIN_EMAIL,
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  }
});

// Middleware
app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from dist directory (production build)
app.use(express.static(path.join(__dirname, '..', 'dist')));

// --- SECURITY: Rate Limiters ---

const RateLimitStore = {
    upload: new Map(),
    pin: new Map(),
    
    // Clean up old entries every hour
    cleanup: setInterval(() => {
        RateLimitStore.upload.clear();
        const now = Date.now();
        for (const [key, data] of RateLimitStore.pin.entries()) {
            if (data.resetTime < now) RateLimitStore.pin.delete(key);
        }
    }, 3600000)
};

// Generic Rate Limiter Helper
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

// Middleware for PIN Brute Force Protection
const pinRateLimiter = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    // Limit: 5 attempts per 15 minutes
    if (!checkRateLimit(RateLimitStore.pin, ip, 5, 15 * 60 * 1000)) {
        return res.status(429).json({ 
            error: "Too many failed attempts. Please try again in 15 minutes." 
        });
    }
    next();
};

// Authentication Middleware (Updated)
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

// Optional Auth Middleware (for Guest Uploads)
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

// Local Temp Storage
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
} else {
    // Clean up on start
    fs.readdir(uploadDir, (err, files) => {
        if (!err) {
            for (const file of files) {
                fs.unlink(path.join(uploadDir, file), () => {});
            }
        }
    });
}

// Database Setup
const dbPath = path.join(__dirname, 'snapify.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('DB Error', err);
    else {
        console.log('Connected to SQLite database');
        db.run("PRAGMA foreign_keys = ON;");
    }
});

// Initialize Tables & Seed Admin
db.serialize(async () => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'USER',
        tier TEXT DEFAULT 'FREE',
        storageUsedMb REAL DEFAULT 0,
        storageLimitMb REAL,
        joinedDate TEXT,
        studioName TEXT,
        logoUrl TEXT,
        watermarkOpacity REAL,
        watermarkSize REAL,
        watermarkPosition TEXT,
        watermarkOffsetX REAL,
        watermarkOffsetY REAL
    )`);

    const adminId = 'admin-system-id';
    const adminName = 'System Admin';
    const joined = new Date().toISOString();
    
    try {
        const hashedAdminPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        db.run(`INSERT OR REPLACE INTO users (id, name, email, password, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName) 
            VALUES (?, ?, ?, ?, 'ADMIN', 'STUDIO', 0, -1, ?, 'System Root')`, 
            [adminId, adminName, ADMIN_EMAIL, hashedAdminPassword, joined], (err) => {
                if (err) console.error("Failed to seed admin user:", err);
                else console.log("System Admin seeded/updated successfully.");
            });
    } catch (err) {
        console.error("Error hashing admin password:", err);
    }

    db.run(`CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        date TEXT,
        city TEXT,
        hostId TEXT,
        code TEXT,
        coverImage TEXT,
        coverMediaType TEXT,
        expiresAt TEXT,
        pin TEXT,
        views INTEGER DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        FOREIGN KEY(hostId) REFERENCES users(id) ON DELETE CASCADE
    )`);
    
    // NEW: Vendors Table
    db.run(`CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY,
        ownerId TEXT,
        businessName TEXT,
        category TEXT,
        city TEXT,
        description TEXT,
        contactEmail TEXT,
        contactPhone TEXT,
        website TEXT,
        instagram TEXT,
        coverImage TEXT,
        isVerified INTEGER DEFAULT 0,
        createdAt TEXT,
        FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.all("PRAGMA table_info(media)", (err, rows) => {
        if (err) return;
        const hasPrivacy = rows.some(row => row.name === 'privacy');
        if (!hasPrivacy) {
            db.run("ALTER TABLE media ADD COLUMN privacy TEXT DEFAULT 'public'");
        }
        const hasUploaderId = rows.some(row => row.name === 'uploaderId');
        if (!hasUploaderId) {
            db.run("ALTER TABLE media ADD COLUMN uploaderId TEXT");
        }
        const hasOrientation = rows.some(row => row.name === 'orientation');
        if (!hasOrientation) {
            db.run("ALTER TABLE media ADD COLUMN orientation INTEGER DEFAULT 1");
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        eventId TEXT,
        type TEXT,
        url TEXT,
        previewUrl TEXT,
        isProcessing INTEGER DEFAULT 0,
        caption TEXT,
        uploadedAt TEXT,
        uploaderName TEXT,
        isWatermarked INTEGER,
        watermarkText TEXT,
        likes INTEGER DEFAULT 0,
        privacy TEXT DEFAULT 'public',
        uploaderId TEXT,
        orientation INTEGER DEFAULT 1,
        FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS guestbook (
        id TEXT PRIMARY KEY,
        eventId TEXT,
        senderName TEXT,
        message TEXT,
        createdAt TEXT,
        FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        mediaId TEXT,
        eventId TEXT,
        senderName TEXT,
        text TEXT,
        createdAt TEXT,
        FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE
    )`);
});

// File upload middleware
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
        files: 1 // Only one file per request
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'
        ];
        
        // 1. Check MIME type
        if (!allowedMimes.includes(file.mimetype)) {
            return cb(new Error('Invalid file type'), false);
        }
        
        // 2. Upload Rate Limiting (IP based)
        const clientIP = req.ip || req.connection.remoteAddress;
        // Strict limit: 20 uploads per hour per IP
        if (!checkRateLimit(RateLimitStore.upload, clientIP, 20, 60 * 60 * 1000)) {
            return cb(new Error('Upload limit exceeded. Please try again later.'), false);
        }
        
        cb(null, true);
    }
});

// S3 Helpers
async function uploadToS3(filePath, key, contentType) {
    try {
        const fileStream = fs.createReadStream(filePath);
        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: fileStream,
            ContentType: contentType
        }));
        return key;
    } catch (err) {
        console.error("S3 Upload Error:", err);
        throw new Error('Failed to upload media.');
    } finally {
        if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
    }
}

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('join_event', (eventId) => {
        socket.join(eventId);
    });

    // NEW: Admin Force Reload Listener
    socket.on('admin_trigger_reload', (token) => {
        try {
            const user = jwt.verify(token, JWT_SECRET);
            if (user.role === 'ADMIN') {
                console.log(`Admin ${user.id} triggered global reload`);
                // Broadcast to ALL clients connected
                io.emit('force_client_reload', { version: Date.now() });
            }
        } catch (e) {
            console.error("Unauthorized reload attempt");
        }
    });
});


// --- ROUTES ---

app.get('/api/proxy-media', async (req, res) => {
    const { key } = req.query;
    if (!key || typeof key !== 'string') return res.status(400).send("Missing key");

    try {
        const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: key
        });
        
        const { Body, ContentType } = await s3Client.send(command);
        
        if (ContentType) res.setHeader('Content-Type', ContentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        
        // @ts-ignore - Body is a readable stream
        Body.pipe(res);
    } catch (e) {
        console.error("Proxy Error:", e);
        res.status(404).send("Not Found");
    }
});

function getPublicUrl(key) {
    return `/api/proxy-media?key=${encodeURIComponent(key)}`;
}

async function attachPublicUrls(mediaList) {
    return mediaList.map(m => ({
        ...m,
        url: getPublicUrl(m.url), 
        previewUrl: m.previewUrl ? getPublicUrl(m.previewUrl) : null,
        s3Key: m.url 
    }));
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.get('/api/system/storage', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Unauthorized" });

    try {
        // Get system disk usage
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const diskUsage = await execAsync('df -h / | tail -1');
        const diskParts = diskUsage.stdout.trim().split(/\s+/);
        const systemStorage = {
            filesystem: diskParts[0],
            size: diskParts[1],
            used: diskParts[2],
            available: diskParts[3],
            usePercent: diskParts[4]
        };

        // Get MinIO data directory size (handle remote MinIO gracefully)
        let minioData = { dataPath: 'Remote MinIO Server', size: 'N/A' };
        try {
            const minioDataPath = '/mnt/data'; // Local path if MinIO is running locally
            const minioUsage = await execAsync(`du -sh ${minioDataPath}`);
            const minioSize = minioUsage.stdout.trim().split('\t')[0];
            minioData = { dataPath: minioDataPath, size: minioSize };
        } catch (minioError) {
            // MinIO data directory not accessible (likely remote server)
            minioData = { dataPath: `${S3_ENDPOINT} (${S3_BUCKET})`, size: 'Remote' };
        }

        res.json({
            system: systemStorage,
            minio: minioData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Storage info error:', error);
        res.status(500).json({ error: 'Failed to get storage info' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Required" });

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user || !user.password) return res.status(401).json({ error: "Invalid credentials" });

        try {
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) return res.status(401).json({ error: "Invalid credentials" });
        } catch (bcryptErr) {
            return res.status(500).json({ error: "Authentication error" });
        }

        const { password: _, ...safeUser } = user;
        const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
        res.json({ token, user: safeUser });
    });
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

app.post('/api/auth/google', async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Required" });
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: "Not configured" });

    try {
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) return res.status(401).json({ error: "Invalid Google token" });

        const { email, name } = payload;
        const normalizedEmail = email.toLowerCase();
        const safeRole = 'USER';
        const safeTier = 'FREE';
        const safeStorageLimit = 100; 

        db.get("SELECT * FROM users WHERE lower(email) = ?", [normalizedEmail], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (row) {
                const token = jwt.sign({ id: row.id, role: row.role, email: row.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
                return res.json({ token, user: row });
            } else {
                const newId = `user-${Date.now()}`;
                const joinedDate = new Date().toISOString().split('T')[0];
                const stmt = db.prepare(`INSERT INTO users (id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                stmt.run(newId, name, email, safeRole, safeTier, 0, safeStorageLimit, joinedDate, null, function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    const token = jwt.sign({ id: newId, role: safeRole, email: email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
                    const newUser = { id: newId, name, email, role: safeRole, tier: safeTier, storageUsedMb: 0, storageLimitMb: safeStorageLimit, joinedDate };
                    res.json({ token, user: newUser });
                });
                stmt.finalize();
            }
        });
    } catch (error) {
        return res.status(401).json({ error: "Google authentication failed" });
    }
});

app.post('/api/ai/generate-caption', authenticateToken, async (req, res) => {
    const { base64Image } = req.body;
    if (!base64Image) return res.status(400).json({ error: "Required" });
    const ai = getGeminiClient();
    if (!ai) return res.json({ caption: "Event memory" });
    try {
        const cleanBase64 = base64Image.split(',')[1] || base64Image;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } }, { text: "Generate a short caption (max 10 words) for this photo." }] }
        });
        res.json({ caption: response.text });
    } catch (error) { res.json({ caption: "Captured moment" }); }
});

app.post('/api/ai/generate-event-description', authenticateToken, async (req, res) => {
    const { title, date, type } = req.body;
    if (!title) return res.status(400).json({ error: "Required" });
    const ai = getGeminiClient();
    if (!ai) return res.json({ description: "Join us!" });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Write a short, exciting description (max 2 sentences) for a ${type} event named "${title}" happening on ${date}.`,
        });
        res.json({ description: response.text });
    } catch (error) { res.json({ description: "Join us!" }); }
});

app.post('/api/admin/reset', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Unauthorized" });
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
            const adminName = 'System Admin';
            const joined = new Date().toISOString();
            const hashedAdminPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
            db.run(`INSERT OR IGNORE INTO users (id, name, email, password, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName) 
                    VALUES (?, ?, ?, ?, 'ADMIN', 'STUDIO', 0, -1, ?, 'System Root')`, 
                    [adminId, adminName, ADMIN_EMAIL, hashedAdminPassword, joined]);
        });
        fs.readdir(uploadDir, (err, files) => {
            if (!err) { for (const file of files) fs.unlink(path.join(uploadDir, file), () => {}); }
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Reset Error" }); }
});

app.get('/api/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    db.all("SELECT * FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// VENDOR ROUTES
app.post('/api/vendors', authenticateToken, async (req, res) => {
    db.get("SELECT id FROM vendors WHERE ownerId = ?", [req.user.id], (err, row) => {
        if (row) return res.status(400).json({ error: "Profile exists" });
        const v = req.body;
        const vendorId = `vendor-${Date.now()}`;
        const stmt = db.prepare(`INSERT INTO vendors (id, ownerId, businessName, category, city, description, contactEmail, contactPhone, website, instagram, isVerified, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`);
        stmt.run(vendorId, req.user.id, v.businessName, v.category, v.city, v.description, v.contactEmail, v.contactPhone, v.website, v.instagram, new Date().toISOString(), (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, vendorId });
        });
        stmt.finalize();
    });
});

app.get('/api/vendors', (req, res) => {
    const { city } = req.query;
    let query = "SELECT * FROM vendors"; 
    const params = [];
    if (city) {
        query += " WHERE lower(city) = ?";
        params.push(city.toString().toLowerCase());
    }
    query += " ORDER BY RANDOM() LIMIT 5"; 
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/events', authenticateToken, (req, res) => {
    const callerId = req.user.id;
    const query = req.user.role === 'ADMIN' 
        ? `SELECT events.*, users.tier as hostTier FROM events JOIN users ON events.hostId = users.id`
        : `SELECT events.*, users.tier as hostTier FROM events JOIN users ON events.hostId = users.id WHERE events.hostId = ?`;
    const params = req.user.role === 'ADMIN' ? [] : [callerId];

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

app.put('/api/events/:id', authenticateToken, (req, res) => {
    const e = req.body;
    db.get("SELECT hostId FROM events WHERE id = ?", [req.params.id], (err, row) => {
        if (!row) return res.status(404).json({ error: "Not found" });
        if (row.hostId !== req.user.id && req.user.role !== 'ADMIN') return res.sendStatus(403);
        const stmt = db.prepare(`UPDATE events SET title=?, description=?, coverImage=?, coverMediaType=?, expiresAt=?, views=?, downloads=? WHERE id=?`);
        stmt.run(e.title, e.description, e.coverImage, e.coverMediaType, e.expiresAt, e.views, e.downloads, req.params.id, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
        stmt.finalize();
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

app.post('/api/media', optionalAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const body = req.body;
    if (req.user) {
        if (body.uploaderId !== req.user.id) return res.status(403).json({ error: "Identity mismatch" });
    } else {
        if (!body.uploaderId || !body.uploaderId.startsWith('guest-')) body.uploaderId = `guest-anon-${Date.now()}`;
    }
    const isVideo = body.type === 'video';
    const ext = path.extname(req.file.originalname);
    const s3Key = `events/${body.eventId}/${body.id}${ext}`;
    const stmt = db.prepare(`INSERT INTO media (id, eventId, type, url, previewUrl, isProcessing, caption, uploadedAt, uploaderName, uploaderId, isWatermarked, watermarkText, likes, privacy, orientation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    if (!isVideo) {
        try {
            // Extract EXIF orientation for proper image rotation
            const orientation = await getImageOrientation(req.file.path);

            const previewFilename = `thumb_${path.parse(req.file.filename).name}.jpg`;
            const previewPath = path.join(uploadDir, previewFilename);
            const previewKey = `events/${body.eventId}/thumb_${body.id}.jpg`;
            await sharp(req.file.path).resize(400, 400, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(previewPath);
            await Promise.all([uploadToS3(req.file.path, s3Key, req.file.mimetype), uploadToS3(previewPath, previewKey, 'image/jpeg')]);
            fs.unlink(previewPath, () => {});
            stmt.run(body.id, body.eventId, body.type, s3Key, previewKey, 0, body.caption, body.uploadedAt, body.uploaderName, body.uploaderId, body.isWatermarked === 'true' ? 1 : 0, body.watermarkText, 0, body.privacy || 'public', orientation, (err) => {
                const item = { id: body.id, eventId: body.eventId, url: getPublicUrl(s3Key), previewUrl: getPublicUrl(previewKey), type: body.type, caption: body.caption, isProcessing: false, uploadedAt: body.uploadedAt, uploaderName: body.uploaderName, likes: 0, comments: [], privacy: body.privacy || 'public', orientation };
                io.to(body.eventId).emit('media_uploaded', item);
                res.json(item);
            });
            stmt.finalize();
        } catch (e) { res.status(500).json({ error: e.message }); }
    } else {
        // VIDEO DURATION VALIDATION: Check video length before processing
        const checkVideoDuration = async (filePath) => {
            return new Promise((resolve, reject) => {
                const ffprobe = spawn('ffprobe', [
                    '-v', 'quiet',
                    '-print_format', 'json',
                    '-show_format',
                    '-show_streams',
                    filePath
                ]);

                let output = '';
                ffprobe.stdout.on('data', (data) => {
                    output += data.toString();
                });

                ffprobe.on('close', (code) => {
                    if (code !== 0) {
                        reject(new Error('Failed to analyze video'));
                        return;
                    }

                    try {
                        const data = JSON.parse(output);
                        const duration = parseFloat(data.format.duration);
                        resolve(duration);
                    } catch (e) {
                        reject(new Error('Failed to parse video metadata'));
                    }
                });

                ffprobe.on('error', (err) => {
                    reject(err);
                });
            });
        };

        try {
            const duration = await checkVideoDuration(req.file.path);
            const maxDuration = 10; // 10 seconds limit for all tiers

            if (duration > maxDuration) {
                // Clean up uploaded file
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                return res.status(400).json({
                    error: `Video too long. Maximum duration is ${maxDuration} seconds. Your video is ${duration.toFixed(1)} seconds.`
                });
            }

            // Video is within limits, proceed with upload
            stmt.run(body.id, body.eventId, body.type, s3Key, '', 1, body.caption, body.uploadedAt, body.uploaderName, body.uploaderId, body.isWatermarked === 'true' ? 1 : 0, body.watermarkText, 0, body.privacy || 'public', (err) => {
                const item = { id: body.id, eventId: body.eventId, url: '', type: body.type, caption: body.caption, isProcessing: true, uploadedAt: body.uploadedAt, uploaderName: body.uploaderName, likes: 0, comments: [], privacy: body.privacy || 'public' };
                io.to(body.eventId).emit('media_uploaded', item);
                res.json(item);
                const processVideo = async () => {
                    const inputPath = req.file.path;
                    if (!inputPath.startsWith(uploadDir)) return;
                    const outputPath = path.join(uploadDir, `preview_${path.parse(req.file.filename).name}.mp4`);
                    const previewKey = `events/${body.eventId}/preview_${body.id}.mp4`;
                    const ffmpeg = spawn('ffmpeg', ['-i', inputPath, '-vf', 'scale=-2:720', '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k', '-y', outputPath]);
                    ffmpeg.on('close', async (code) => {
                        if (code === 0) {
                            try {
                                await Promise.all([uploadToS3(inputPath, s3Key, req.file.mimetype), uploadToS3(outputPath, previewKey, 'video/mp4')]);
                                db.run("UPDATE media SET isProcessing = 0, previewUrl = ? WHERE id = ?", [previewKey, body.id], () => {
                                    io.to(body.eventId).emit('media_processed', { id: body.id, previewUrl: getPublicUrl(previewKey), url: getPublicUrl(s3Key) });
                                });
                            } catch (e) {}
                        }
                        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    });
                };
                processVideo().catch(console.error);
            });
            stmt.finalize();
        } catch (durationError) {
            console.error('Video duration check failed:', durationError);
            // Clean up uploaded file
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(400).json({
                error: 'Unable to validate video duration. Please try again or contact support.'
            });
        }
    }
});

app.delete('/api/media/:id', authenticateToken, (req, res) => {
    db.get(`SELECT media.url, media.previewUrl, events.hostId, media.uploaderId FROM media JOIN events ON media.eventId = events.id WHERE media.id = ?`, [req.params.id], async (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Not found" });
        if (req.user.role !== 'ADMIN' && row.hostId !== req.user.id && row.uploaderId !== req.user.id) return res.sendStatus(403);
        try {
            if (row.url) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.url }));
            if (row.previewUrl) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.previewUrl }));
        } catch (e) {}
        db.run("DELETE FROM media WHERE id = ?", req.params.id, (err) => res.json({ success: true }));
    });
});

app.put('/api/media/:id/like', (req, res) => {
    const stmt = db.prepare("UPDATE media SET likes = likes + 1 WHERE id = ?");
    stmt.run(req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT likes FROM media WHERE id = ?", [req.params.id], (err, row) => {
            if (row) {
                io.to(row.eventId).emit('new_like', { id: req.params.id, likes: row.likes });
                res.json({ success: true, likes: row.likes });
            } else {
                res.status(404).json({ error: "Media not found" });
            }
        });
    });
    stmt.finalize();
});

app.post('/api/guestbook', async (req, res) => {
    const { eventId, senderName, message, createdAt } = req.body;
    const id = crypto.randomUUID();
    const stmt = db.prepare("INSERT INTO guestbook (id, eventId, senderName, message, createdAt) VALUES (?, ?, ?, ?, ?)");
    stmt.run(id, eventId, senderName, message, createdAt, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        const entry = { id, eventId, senderName, message, createdAt };
        io.to(eventId).emit('new_message', entry);
        res.json(entry);
    });
    stmt.finalize();
});

app.post('/api/comments', async (req, res) => {
    const { mediaId, eventId, senderName, text, createdAt } = req.body;
    const id = crypto.randomUUID();
    const stmt = db.prepare("INSERT INTO comments (id, mediaId, eventId, senderName, text, createdAt) VALUES (?, ?, ?, ?, ?, ?)");
    stmt.run(id, mediaId, eventId, senderName, text, createdAt, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        const comment = { id, mediaId, eventId, senderName, text, createdAt };
        io.to(eventId).emit('new_comment', comment);
        res.json(comment);
    });
    stmt.finalize();
});

app.post('/api/events/:id/validate-pin', pinRateLimiter, (req, res) => {
    const { pin } = req.body;
    db.get("SELECT pin FROM events WHERE id = ?", [req.params.id], (err, row) => {
        if (!row) return res.status(404).json({ error: "Not found" });
        res.json({ success: !row.pin || row.pin === pin });
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
            // Auth check per item
            if (req.user.role !== 'ADMIN' && row.hostId !== req.user.id && row.uploaderId !== req.user.id) {
                return; 
            }

            try {
                if (row.url) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.url }));
                if (row.previewUrl) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.previewUrl }));
                
                await new Promise((resolve, reject) => {
                    db.run("DELETE FROM media WHERE id = ?", [row.id], (err) => {
                        if (err) reject(err);
                        else {
                            deletedCount++;
                            resolve(true);
                        }
                    });
                });
            } catch (e) {
                console.error(`Failed to delete media ${row.id}`, e);
            }
        });

        await Promise.all(deletePromises);
        res.json({ success: true, deletedCount });
    });
});

// --- Database Management Routes (Admin Only) ---

app.put('/api/users/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'ADMIN' && req.user.id !== req.params.id) return res.sendStatus(403);
    const u = req.body;
    const stmt = db.prepare("UPDATE users SET name=?, email=?, role=?, tier=?, storageUsedMb=?, storageLimitMb=?, studioName=?, logoUrl=?, watermarkOpacity=?, watermarkSize=?, watermarkPosition=?, watermarkOffsetX=?, watermarkOffsetY=? WHERE id=?");
    stmt.run(u.name, u.email, u.role, u.tier, u.storageUsedMb, u.storageLimitMb, u.studioName, u.logoUrl, u.watermarkOpacity, u.watermarkSize, u.watermarkPosition, u.watermarkOffsetX, u.watermarkOffsetY, req.params.id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        // Notify connected clients if user data changed (e.g. storage update)
        io.emit('user_updated', u);
        res.json({ success: true });
    });
    stmt.finalize();
});

app.delete('/api/users/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    // Cascading delete handles events/media via SQL foreign keys, but we should clean up S3
    // 1. Get all media for user's events
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

// Catch-all handler: send back index.html for client-side routing
// This must be the last route
app.use((req, res) => {
    // Only serve index.html for non-API routes
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

server.listen(PORT, () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});