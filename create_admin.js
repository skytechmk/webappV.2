import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'server/snapify.db');

const { verbose } = sqlite3;
const db = new sqlite3.Database(dbPath);

const adminId = 'admin-system-id';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@skytech.mk';
const adminPassword = process.env.ADMIN_PASSWORD || 'Nanaipi123@';

async function createAdminUser() {
    try {
        console.log('Creating admin user...');
        console.log('Email:', adminEmail);

        // Hash the password
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        console.log('Password hashed successfully');

        // Delete existing admin if exists
        db.run('DELETE FROM users WHERE id = ?', [adminId]);
        db.run('DELETE FROM users WHERE email = ?', [adminEmail]);
        console.log('Cleaned existing admin users');

        // Insert new admin user
        const stmt = db.prepare(`INSERT INTO users (id, name, email, password, role, tier, storageUsedMb, storageLimitMb, joinedDate, studioName)
            VALUES (?, ?, ?, ?, 'ADMIN', 'STUDIO', 0, -1, ?, 'System Root')`);

        const result = stmt.run(adminId, 'System Admin', adminEmail, hashedPassword, new Date().toISOString());
        stmt.finalize();

        console.log('Admin user created successfully');
        console.log('Result:', result);

        // Verify creation
        const verify = db.prepare('SELECT id, email, password FROM users WHERE id = ?').get(adminId);
        if (verify && verify.password) {
            console.log('✅ Admin user verification successful');
            console.log('Login credentials:');
            console.log('Email:', adminEmail);
            console.log('Password:', adminPassword);
        } else {
            console.log('❌ Admin user verification failed');
        }

    } catch (error) {
        console.error('Error creating admin user:', error);
    } finally {
        db.close();
    }
}

createAdminUser();