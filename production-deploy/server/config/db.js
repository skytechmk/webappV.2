import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { config } from './env.js';
import { createPerformanceIndexes } from './db_indexes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../../server/snapify.db');

const { verbose } = sqlite3;

export const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('DB Error', err);
    else {
        console.log('Connected to SQLite database');
        console.log('SQLite package version check - using sqlite3 package');
        db.run("PRAGMA foreign_keys = ON;");
        // Temporarily disable WAL mode to avoid I/O issues
        // db.run("PRAGMA journal_mode = DELETE;");
        console.log('SQLite database initialized');
    }
});

export const initDb = () => {
    db.serialize(async () => {
        // Create tables
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'USER',
            tier TEXT DEFAULT 'FREE', storageUsedMb REAL DEFAULT 0, storageLimitMb REAL,
            joinedDate TEXT, studioName TEXT, logoUrl TEXT, watermarkOpacity REAL,
            watermarkSize REAL, watermarkPosition TEXT, watermarkOffsetX REAL, watermarkOffsetY REAL
        )`);

        // Create other tables
        db.run(`CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY, title TEXT, description TEXT, date TEXT, city TEXT,
            hostId TEXT, code TEXT, coverImage TEXT, coverMediaType TEXT,
            expiresAt TEXT, pin TEXT, views INTEGER DEFAULT 0, downloads INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(hostId) REFERENCES users(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS media (
            id TEXT PRIMARY KEY, eventId TEXT, type TEXT, url TEXT, previewUrl TEXT,
            isProcessing INTEGER DEFAULT 0, caption TEXT, uploadedAt TEXT,
            uploaderName TEXT, uploaderId TEXT, isWatermarked INTEGER,
            watermarkText TEXT, likes INTEGER DEFAULT 0, privacy TEXT DEFAULT 'public',
            FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS guestbook (
            id TEXT PRIMARY KEY, eventId TEXT, senderName TEXT, message TEXT,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY, mediaId TEXT, eventId TEXT, senderName TEXT,
            text TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(mediaId) REFERENCES media(id) ON DELETE CASCADE,
            FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS support_messages (
            id TEXT PRIMARY KEY, userId TEXT, message TEXT, isFromAdmin INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
        )`);

        const adminId = 'admin-system-id';
        try {
            // Check if users table exists
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
            if (!tables) {
                console.log('Users table does not exist yet, skipping admin setup');
                return;
            }

            const hashedAdminPassword = await bcrypt.hash(config.ADMIN_PASSWORD, 10);
            console.log('Setting up admin user with password hash length:', hashedAdminPassword.length);

            // Delete existing admin user if it exists (to ensure clean state)
            db.run('DELETE FROM users WHERE id = ?', [adminId]);
            console.log('Removed existing admin user by ID');

            // Also delete any user with the admin email to avoid conflicts
            db.run('DELETE FROM users WHERE email = ?', [config.ADMIN_EMAIL]);
            console.log('Removed existing admin user by email');

            // Create fresh admin user
            console.log('Creating new admin user...');
            console.log('Admin ID:', adminId);
            console.log('Admin Email:', config.ADMIN_EMAIL);
            console.log('Password hash preview:', hashedAdminPassword.substring(0, 10) + '...');

            try {
                console.log('About to execute INSERT statement...');
                const insertQuery = `INSERT INTO users (id, name, email, password, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName)
                    VALUES (?, ?, ?, ?, 'ADMIN', 'STUDIO', 0, -1, ?, 'System Root')`;
                console.log('Insert query:', insertQuery);
                console.log('Parameters:', [adminId, 'System Admin', config.ADMIN_EMAIL, hashedAdminPassword.substring(0, 10) + '...', new Date().toISOString()]);

                // Use sqlite3 async API instead of better-sqlite3
                console.log('Using sqlite3 async db.run() API...');
                db.run(insertQuery, [adminId, 'System Admin', config.ADMIN_EMAIL, hashedAdminPassword, new Date().toISOString()], function(err) {
                    if (err) {
                        console.error('INSERT error:', err);
                        console.error('Error message:', err.message);
                        console.error('Error code:', err.code);
                    } else {
                        console.log('INSERT executed successfully, changes:', this.changes);
                        console.log('Last insert ID:', this.lastID);
                    }
                });
            } catch (insertError) {
                console.error('INSERT error:', insertError);
                console.error('Error message:', insertError.message);
                console.error('Error code:', insertError.code);
            }

            // Verify admin user was created with a small delay
            setTimeout(() => {
                try {
                    console.log('Verifying admin user creation...');
                    db.get('SELECT id, email, password FROM users WHERE id = ?', [adminId], (err, row) => {
                        if (err) {
                            console.error('Verification query error:', err);
                        } else {
                            console.log('Admin verification - has password:', !!row?.password, 'password length:', row?.password?.length || 0);
                            if (row?.password) {
                                console.log('✅ Admin user created successfully with password');
                            } else {
                                console.log('❌ Admin user creation failed - no password found');
                                // Try to create admin user again with direct db.run
                                console.log('Retrying admin creation with direct insert...');
                                db.run(`INSERT OR REPLACE INTO users (id, name, email, password, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName)
                                    VALUES (?, ?, ?, ?, 'ADMIN', 'STUDIO', 0, -1, ?, 'System Root')`,
                                    [adminId, 'System Admin', config.ADMIN_EMAIL, hashedAdminPassword, new Date().toISOString()], function(err) {
                                    if (err) {
                                        console.error('Retry insert failed:', err);
                                    } else {
                                        console.log('Retry insert successful, changes:', this.changes);
                                        // Final check
                                        db.get('SELECT id, email, password FROM users WHERE id = ?', [adminId], (err, finalRow) => {
                                            if (finalRow?.password) {
                                                console.log('✅ Admin user created successfully on retry');
                                            } else {
                                                console.log('❌ Admin user creation still failed');
                                            }
                                        });
                                    }
                                });
                            }
                        }
                    });
                } catch (verifyError) {
                    console.error('Verification error:', verifyError);
                }
            }, 500); // Increased delay for async operations

        } catch (err) {
            console.error("Error seeding admin:", err);
        }

        db.run(`CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY, title TEXT, description TEXT, date TEXT, city TEXT, hostId TEXT,
            code TEXT, coverImage TEXT, coverMediaType TEXT, expiresAt TEXT, pin TEXT,
            views INTEGER DEFAULT 0, downloads INTEGER DEFAULT 0, createdAt TEXT,
            FOREIGN KEY(hostId) REFERENCES users(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS vendors (
            id TEXT PRIMARY KEY, ownerId TEXT, businessName TEXT, category TEXT, city TEXT,
            description TEXT, contactEmail TEXT, contactPhone TEXT, website TEXT, instagram TEXT,
            coverImage TEXT, isVerified INTEGER DEFAULT 0, createdAt TEXT,
            FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // Migrations for existing tables
        db.all("PRAGMA table_info(events)", (err, rows) => {
            if (err) {
                console.error('Error checking events table info:', err);
                return;
            }
            console.log('Events table columns:', rows.map(r => r.name));
            if (!rows.some(row => row.name === 'createdAt')) {
                console.log('Adding createdAt column to events table...');
                db.run("ALTER TABLE events ADD COLUMN createdAt TEXT", (err) => {
                    if (err) {
                        console.error('Error adding createdAt column:', err);
                    } else {
                        console.log('Successfully added createdAt column');
                        // Set createdAt for existing events to their date or current time
                        db.run("UPDATE events SET createdAt = COALESCE(date, datetime('now')) WHERE createdAt IS NULL", (err) => {
                            if (err) {
                                console.error('Error updating createdAt values:', err);
                            } else {
                                console.log('Successfully updated createdAt values for existing events');
                            }
                        });
                    }
                });
            } else {
                console.log('createdAt column already exists in events table');
            }
        });

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

        // Create performance indexes after table creation
        setTimeout(() => {
            createPerformanceIndexes();
        }, 1000); // Small delay to ensure tables are created
    });
};
