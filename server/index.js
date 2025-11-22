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
import webpush from 'web-push'; // Added web-push

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3001;
const ADMIN_EMAIL = process.env.VITE_ADMIN_EMAIL || 'admin@skytech.mk';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; 
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_production_secure_random_string';
const JWT_EXPIRY = '365d'; // CHANGED: Extended session to 1 year

// Domain Management
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';

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

// Authentication Middleware
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

// Local Temp Storage
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
} else {
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

// Initialize Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
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
    
    db.run(`INSERT OR IGNORE INTO users (id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName) 
            VALUES (?, ?, ?, 'ADMIN', 'STUDIO', 0, -1, ?, 'System Root')`, 
            [adminId, adminName, ADMIN_EMAIL, joined], (err) => {
                if (err) console.error("Failed to seed admin user:", err);
            });

    db.run(`CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        date TEXT,
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
    
    db.all("PRAGMA table_info(media)", (err, rows) => {
        if (err) return;
        const hasPrivacy = rows.some(row => row.name === 'privacy');
        if (!hasPrivacy) {
            console.log("Migrating media table: Adding privacy column...");
            db.run("ALTER TABLE media ADD COLUMN privacy TEXT DEFAULT 'public'");
        }
        const hasUploaderId = rows.some(row => row.name === 'uploaderId');
        if (!hasUploaderId) {
            console.log("Migrating media table: Adding uploaderId column...");
            db.run("ALTER TABLE media ADD COLUMN uploaderId TEXT");
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

// File Upload Middleware
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

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
        
        // @ts-ignore
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

io.on('connection', (socket) => {
    socket.on('join_event', (eventId) => {
        socket.join(eventId);
    });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
        const token = jwt.sign({ 
            id: 'admin-system-id', 
            role: 'ADMIN', 
            email: ADMIN_EMAIL 
        }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
        
        const adminUser = {
            id: 'admin-system-id',
            name: 'System Admin',
            email: ADMIN_EMAIL,
            role: 'ADMIN',
            tier: 'STUDIO',
            storageUsedMb: 0,
            storageLimitMb: Infinity,
            joinedDate: new Date().toISOString()
        };
        
        db.run(`INSERT OR IGNORE INTO users (id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName) 
            VALUES (?, ?, ?, 'ADMIN', 'STUDIO', 0, -1, ?, 'System Root')`, 
            ['admin-system-id', 'System Admin', ADMIN_EMAIL, new Date().toISOString()], (err) => {
                if (err) console.error("Self-repair admin seed failed:", err);
            });

        return res.json({ token, user: adminUser });
    }

    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: "User not found" });

        const token = jwt.sign({ 
            id: user.id, 
            role: user.role, 
            email: user.email 
        }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

        res.json({ token, user });
    });
});

app.post('/api/auth/google', (req, res) => {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalizedEmail = email.toLowerCase();
    const safeRole = 'USER';
    const safeTier = 'FREE';
    const safeStorageLimit = 100; 

    db.get("SELECT * FROM users WHERE lower(email) = ?", [normalizedEmail], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row) {
            const token = jwt.sign({ 
                id: row.id, 
                role: row.role, 
                email: row.email 
            }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
            return res.json({ token, user: row });
        } else {
            const newId = `user-${Date.now()}`;
            const joinedDate = new Date().toISOString().split('T')[0];
            
            const stmt = db.prepare(`INSERT INTO users (id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            stmt.run(newId, name, email, safeRole, safeTier, 0, safeStorageLimit, joinedDate, null, function(err) {
                if (err) return res.status(500).json({ error: err.message });
                
                const token = jwt.sign({ 
                    id: newId, 
                    role: safeRole, 
                    email: email 
                }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

                const newUser = { 
                    id: newId, name, email, role: safeRole, tier: safeTier, 
                    storageUsedMb: 0, storageLimitMb: safeStorageLimit, joinedDate 
                };
                res.json({ token, user: newUser });
            });
            stmt.finalize();
        }
    });
});

app.post('/api/push/subscribe', authenticateToken, (req, res) => {
    res.status(201).json({});
});

app.post('/api/push/send', authenticateToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);
    res.json({ success: true, message: "Push notifications queued" });
});

app.post('/api/admin/reset', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const { confirmation } = req.body;
    if (confirmation !== 'RESET_CONFIRM') {
        return res.status(400).json({ error: "Invalid confirmation code" });
    }

    try {
        db.serialize(() => {
            db.run("DELETE FROM comments");
            db.run("DELETE FROM guestbook");
            db.run("DELETE FROM media");
            db.run("DELETE FROM events");
            db.run("DELETE FROM users");
            
            const adminId = 'admin-system-id';
            const adminName = 'System Admin';
            const joined = new Date().toISOString();
            db.run(`INSERT OR IGNORE INTO users (id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName) 
                    VALUES (?, ?, ?, 'ADMIN', 'STUDIO', 0, -1, ?, 'System Root')`, 
                    [adminId, adminName, ADMIN_EMAIL, joined]);
        });

        fs.readdir(uploadDir, (err, files) => {
            if (!err) {
                for (const file of files) {
                    fs.unlink(path.join(uploadDir, file), () => {});
                }
            }
        });

        res.json({ success: true, message: "System successfully reset." });

    } catch (error) {
        res.status(500).json({ error: "Internal Server Error during reset" });
    }
});

app.get('/api/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);

    db.all("SELECT * FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', (req, res) => {
    const user = req.body;
    const safeRole = 'USER';
    const safeTier = 'FREE';
    const safeStorageLimit = 100; 

    db.get("SELECT * FROM users WHERE email = ?", [user.email], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            return res.json(row); 
        } else {
            const stmt = db.prepare(`INSERT INTO users (id, name, email, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            stmt.run(user.id, user.name, user.email, safeRole, safeTier, 0, safeStorageLimit, user.joinedDate, user.studioName, function(err) {
                if (err) return res.status(500).json({ error: err.message });
                
                const token = jwt.sign({ 
                    id: user.id, 
                    role: safeRole, 
                    email: user.email 
                }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

                const newUser = { ...user, role: safeRole, tier: safeTier, storageUsedMb: 0, storageLimitMb: safeStorageLimit };
                res.json({ token, user: newUser });
            });
            stmt.finalize();
        }
    });
});

app.put('/api/users/:id', authenticateToken, (req, res) => {
    const u = req.body;
    const targetId = req.params.id;

    if (req.user.id !== targetId && req.user.role !== 'ADMIN') return res.sendStatus(403);

    db.get("SELECT * FROM users WHERE id = ?", [targetId], (err, existingUser) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!existingUser) return res.status(404).json({ error: "User not found" });

        if (u.role !== existingUser.role) {
            if (req.user.id !== 'admin-system-id') {
                return res.status(403).json({ error: "Only the Root Admin can change user roles." });
            }
        }

        const stmt = db.prepare(`UPDATE users SET name=?, role=?, tier=?, storageUsedMb=?, storageLimitMb=?, studioName=?, logoUrl=?, watermarkOpacity=?, watermarkSize=?, watermarkPosition=?, watermarkOffsetX=?, watermarkOffsetY=? WHERE id=?`);
        stmt.run(u.name, u.role, u.tier, u.storageUsedMb, u.storageLimitMb, u.studioName, u.logoUrl, u.watermarkOpacity, u.watermarkSize, u.watermarkPosition, u.watermarkOffsetX, u.watermarkOffsetY, targetId, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            io.emit('user_updated', { ...u, id: targetId });
            res.json({ success: true });
        });
        stmt.finalize();
    });
});

app.delete('/api/users/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.sendStatus(403);

    db.run("DELETE FROM users WHERE id=?", req.params.id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/events', authenticateToken, (req, res) => {
    const callerId = req.user.id;
    const callerRole = req.user.role;

    let query = "SELECT * FROM events WHERE hostId = ?";
    let params = [callerId];

    if (callerRole === 'ADMIN') {
         query = "SELECT * FROM events";
         params = [];
    }

    db.all(query, params, async (err, events) => {
        if (err) return res.status(500).json({ error: err.message });
        try {
            const detailedEvents = await Promise.all(events.map(async (evt) => {
                const media = await new Promise(resolve => db.all("SELECT * FROM media WHERE eventId = ? ORDER BY uploadedAt DESC", [evt.id], (err, rows) => resolve(rows || [])));
                const guestbook = await new Promise(resolve => db.all("SELECT * FROM guestbook WHERE eventId = ? ORDER BY createdAt DESC", [evt.id], (err, rows) => resolve(rows || [])));
                const comments = await new Promise(resolve => db.all("SELECT * FROM comments WHERE eventId = ? ORDER BY createdAt ASC", [evt.id], (err, rows) => resolve(rows || [])));
                
                const signedMedia = await attachPublicUrls(media);
                const mediaWithComments = signedMedia.map(m => ({
                    ...m,
                    comments: comments.filter(c => c.mediaId === m.id)
                }));

                let signedCover = evt.coverImage;
                if (evt.coverImage && !evt.coverImage.startsWith('http')) signedCover = getPublicUrl(evt.coverImage);

                // Admin or Host always sees PIN
                return { ...evt, media: mediaWithComments, guestbook, coverImage: signedCover, hasPin: !!evt.pin };
            }));
            res.json(detailedEvents);
        } catch (e) {
            res.status(500).json({ error: 'Failed to retrieve event data' });
        }
    });
});

app.get('/api/events/:id', (req, res) => {
    db.get("SELECT * FROM events WHERE id = ?", [req.params.id], async (err, event) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!event) return res.status(404).json({ error: 'Event not found' });

        // SECURITY: Check if user is authorized to see the PIN
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        let isAuthorized = false;

        if (token) {
            try {
                const user = jwt.verify(token, JWT_SECRET);
                if (user.role === 'ADMIN' || user.id === event.hostId) {
                    isAuthorized = true;
                }
            } catch (e) {
                // ignore invalid token
            }
        }

        const eventResponse = { ...event };
        if (!isAuthorized) {
            eventResponse.hasPin = !!eventResponse.pin; // Flag for frontend to show lock screen
            delete eventResponse.pin; // Remove PIN from response
        } else {
            eventResponse.hasPin = !!eventResponse.pin;
        }

        try {
            const media = await new Promise(resolve => db.all("SELECT * FROM media WHERE eventId = ? ORDER BY uploadedAt DESC", [req.params.id], (err, rows) => resolve(rows || [])));
            const guestbook = await new Promise(resolve => db.all("SELECT * FROM guestbook WHERE eventId = ? ORDER BY createdAt DESC", [req.params.id], (err, rows) => resolve(rows || [])));
            const comments = await new Promise(resolve => db.all("SELECT * FROM comments WHERE eventId = ? ORDER BY createdAt ASC", [req.params.id], (err, rows) => resolve(rows || [])));
            
            const signedMedia = await attachPublicUrls(media);
            const mediaWithComments = signedMedia.map(m => ({
                ...m,
                comments: comments.filter(c => c.mediaId === m.id)
            }));

            let signedCover = event.coverImage;
            if (event.coverImage && !event.coverImage.startsWith('http')) signedCover = getPublicUrl(event.coverImage);

            res.json({ ...eventResponse, media: mediaWithComments, guestbook, coverImage: signedCover });
        } catch (e) {
            res.status(500).json({ error: 'Failed to retrieve event data' });
        }
    });
});

app.post('/api/events/:id/validate-pin', (req, res) => {
    const { pin } = req.body;
    // This route is secure because it compares on the server-side
    db.get("SELECT pin FROM events WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Event not found" });
        
        // If pin matches or if event has no pin (null/empty), return success
        const isValid = !row.pin || row.pin === pin;
        res.json({ success: isValid });
    });
});

app.post('/api/events', authenticateToken, (req, res) => {
    const e = req.body;
    if (e.hostId !== req.user.id && req.user.role !== 'ADMIN') return res.sendStatus(403);

    const stmt = db.prepare(`INSERT INTO events (id, title, description, date, hostId, code, expiresAt, pin, views, downloads) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(e.id, e.title, e.description, e.date, e.hostId, e.code, e.expiresAt, e.pin, 0, 0, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(e);
    });
    stmt.finalize();
});

app.put('/api/events/:id', authenticateToken, (req, res) => {
    const e = req.body;
    db.get("SELECT hostId FROM events WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Event not found" });

        if (row.hostId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.sendStatus(403);
        }

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
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Event not found" });

        if (row.hostId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.sendStatus(403);
        }

        db.run("DELETE FROM events WHERE id=?", req.params.id, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.post('/api/guestbook', (req, res) => {
    const g = req.body;
    const stmt = db.prepare(`INSERT INTO guestbook (id, eventId, senderName, message, createdAt) VALUES (?, ?, ?, ?, ?)`);
    stmt.run(g.id, g.eventId, g.senderName, g.message, g.createdAt, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        io.to(g.eventId).emit('new_message', g);
        res.json(g);
    });
    stmt.finalize();
});

app.post('/api/comments', (req, res) => {
    const c = req.body;
    const stmt = db.prepare(`INSERT INTO comments (id, mediaId, eventId, senderName, text, createdAt) VALUES (?, ?, ?, ?, ?, ?)`);
    stmt.run(c.id, c.mediaId, c.eventId, c.senderName, c.text, c.createdAt, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        io.to(c.eventId).emit('new_comment', c);
        res.json(c);
    });
    stmt.finalize();
});

app.post('/api/media', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const body = req.body;
    const isVideo = body.type === 'video';
    const ext = path.extname(req.file.originalname);
    const s3Key = `events/${body.eventId}/${body.id}${ext}`;
    const stmt = db.prepare(`INSERT INTO media (id, eventId, type, url, previewUrl, isProcessing, caption, uploadedAt, uploaderName, uploaderId, isWatermarked, watermarkText, likes, privacy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    if (!isVideo) {
        try {
            const previewFilename = `thumb_${path.parse(req.file.filename).name}.jpg`;
            const previewPath = path.join(uploadDir, previewFilename);
            const previewKey = `events/${body.eventId}/thumb_${body.id}.jpg`;

            await sharp(req.file.path)
                .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toFile(previewPath);

            await Promise.all([
                uploadToS3(req.file.path, s3Key, req.file.mimetype),
                uploadToS3(previewPath, previewKey, 'image/jpeg')
            ]);

            fs.unlink(previewPath, () => {});

            stmt.run(body.id, body.eventId, body.type, s3Key, previewKey, 0, body.caption, body.uploadedAt, body.uploaderName, body.uploaderId || null, body.isWatermarked === 'true' ? 1 : 0, body.watermarkText, 0, body.privacy || 'public', async (err) => {
                if (err) return res.status(500).json({ error: err.message });
                
                const publicUrl = getPublicUrl(s3Key);
                const publicPreview = getPublicUrl(previewKey);
                
                const mediaItem = { 
                    id: body.id, 
                    eventId: body.eventId, 
                    url: publicUrl, 
                    previewUrl: publicPreview, 
                    type: body.type, 
                    caption: body.caption, 
                    isProcessing: false, 
                    uploadedAt: body.uploadedAt, 
                    uploaderName: body.uploaderName, 
                    likes: 0, 
                    comments: [],
                    privacy: body.privacy || 'public'
                };
                io.to(body.eventId).emit('media_uploaded', mediaItem);
                res.json(mediaItem);
            });
            stmt.finalize();
        } catch (e) { 
            console.error("Upload/Sharp Error", e);
            res.status(500).json({ error: e.message }); 
        }
    } else {
        stmt.run(body.id, body.eventId, body.type, s3Key, '', 1, body.caption, body.uploadedAt, body.uploaderName, body.uploaderId || null, body.isWatermarked === 'true' ? 1 : 0, body.watermarkText, 0, body.privacy || 'public', (err) => {
            if (err) return res.status(500).json({ error: err.message });
            const mediaItem = { id: body.id, eventId: body.eventId, url: '', type: body.type, caption: body.caption, isProcessing: true, uploadedAt: body.uploadedAt, uploaderName: body.uploaderName, likes: 0, comments: [], privacy: body.privacy || 'public' };
            io.to(body.eventId).emit('media_uploaded', mediaItem);
            res.json(mediaItem);

            const processVideo = async () => {
                const inputPath = req.file.path;
                const outputFilename = `preview_${path.parse(req.file.filename).name}.mp4`;
                const outputPath = path.join(uploadDir, outputFilename);
                const previewKey = `events/${body.eventId}/preview_${body.id}.mp4`;

                return new Promise((resolve, reject) => {
                    const ffmpeg = spawn('ffmpeg', ['-i', inputPath, '-vf', 'scale=-2:720', '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k', '-y', outputPath]);
                    ffmpeg.on('close', async (code) => {
                        if (code === 0) {
                            try {
                                await Promise.all([uploadToS3(inputPath, s3Key, req.file.mimetype), uploadToS3(outputPath, previewKey, 'video/mp4')]);
                                db.run("UPDATE media SET isProcessing = 0, previewUrl = ? WHERE id = ?", [previewKey, body.id], async (err) => {
                                    if (!err) {
                                        const publicPreview = getPublicUrl(previewKey);
                                        const publicOriginal = getPublicUrl(s3Key);
                                        io.to(body.eventId).emit('media_processed', { id: body.id, previewUrl: publicPreview, url: publicOriginal });
                                    }
                                });
                                resolve();
                            } catch (e) { reject(e); }
                        } else {
                            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                            reject("FFmpeg Error");
                        }
                    });
                });
            };
            
            processVideo().catch(console.error);
        });
        stmt.finalize();
    }
});

app.put('/api/media/:id/like', (req, res) => {
    db.run("UPDATE media SET likes = likes + 1 WHERE id = ?", req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT eventId, likes FROM media WHERE id = ?", req.params.id, (err, row) => {
            if (row) io.to(row.eventId).emit('new_like', { id: req.params.id, likes: row.likes });
        });
        res.json({ success: true });
    });
});

app.delete('/api/media/:id', authenticateToken, (req, res) => {
    const query = `
        SELECT media.url, media.previewUrl, events.hostId, media.uploaderId 
        FROM media 
        JOIN events ON media.eventId = events.id 
        WHERE media.id = ?
    `;
    
    db.get(query, [req.params.id], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Media not found" });

        const isAuthorized = req.user.role === 'ADMIN' || 
                           row.hostId === req.user.id || 
                           row.uploaderId === req.user.id;
        
        if (!isAuthorized) {
            return res.sendStatus(403);
        }

        try {
            if (row.url) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.url }));
            if (row.previewUrl) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.previewUrl }));
        } catch (e) { console.error("S3 Delete Error:", e.message); }

        db.run("DELETE FROM media WHERE id = ?", req.params.id, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.post('/api/media/bulk-delete', authenticateToken, (req, res) => {
    const { mediaIds } = req.body;
    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) return res.status(400).json({ error: 'Invalid media IDs' });

    if (req.user.role === 'ADMIN') {
        processBulkDelete(mediaIds, res);
    } else {
        const placeholders = mediaIds.map(() => '?').join(',');
        const checkQuery = `
            SELECT DISTINCT events.hostId 
            FROM media 
            JOIN events ON media.eventId = events.id 
            WHERE media.id IN (${placeholders})
        `;
        
        db.all(checkQuery, mediaIds, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const isAuthorized = rows.every(row => row.hostId === req.user.id);
            if (!isAuthorized) return res.sendStatus(403);

            processBulkDelete(mediaIds, res);
        });
    }
});

function processBulkDelete(mediaIds, res) {
    const placeholders = mediaIds.map(() => '?').join(',');
    db.all(`SELECT id, url, previewUrl FROM media WHERE id IN (${placeholders})`, mediaIds, async (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        for (const row of rows) {
            try {
                if (row.url) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.url }));
                if (row.previewUrl) await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: row.previewUrl }));
            } catch (e) { console.error("S3 Delete Error:", e.message); }
        }
        db.run(`DELETE FROM media WHERE id IN (${placeholders})`, mediaIds, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, deletedCount: mediaIds.length });
        });
    });
}

server.listen(PORT, () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});