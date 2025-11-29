// Database Performance Indexes Migration
// Run this script to add essential indexes for performance optimization

import { db } from './db.js';

export const createPerformanceIndexes = () => {
    console.log('Creating performance indexes...');

    // Essential indexes for events table
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_host_id ON events(hostId)`, (err) => {
        if (err) console.error('Error creating idx_events_host_id:', err);
        else console.log('✓ Created idx_events_host_id');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_events_expires_at ON events(expiresAt)`, (err) => {
        if (err) console.error('Error creating idx_events_expires_at:', err);
        else console.log('✓ Created idx_events_expires_at');
    });

    // Essential indexes for media table
    db.run(`CREATE INDEX IF NOT EXISTS idx_media_event_id ON media(eventId)`, (err) => {
        if (err) console.error('Error creating idx_media_event_id:', err);
        else console.log('✓ Created idx_media_event_id');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_media_uploaded_at ON media(uploadedAt DESC)`, (err) => {
        if (err) console.error('Error creating idx_media_uploaded_at:', err);
        else console.log('✓ Created idx_media_uploaded_at');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_media_type_processing ON media(type, isProcessing) WHERE isProcessing = 1`, (err) => {
        if (err) console.error('Error creating idx_media_type_processing:', err);
        else console.log('✓ Created idx_media_type_processing');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_media_privacy ON media(privacy)`, (err) => {
        if (err) console.error('Error creating idx_media_privacy:', err);
        else console.log('✓ Created idx_media_privacy');
    });

    // Note: events table doesn't have createdAt column, using id as ordering proxy
    // Composite index for host filtering (SQLite will use this for ordering)
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_host_id ON events(hostId)`, (err) => {
        if (err) console.error('Error creating idx_events_host_id:', err);
        else console.log('✓ Created idx_events_host_id');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_media_event_uploaded ON media(eventId, uploadedAt DESC)`, (err) => {
        if (err) console.error('Error creating idx_media_event_uploaded:', err);
        else console.log('✓ Created idx_media_event_uploaded');
    });

    // Indexes for guestbook table
    db.run(`CREATE INDEX IF NOT EXISTS idx_guestbook_event_id ON guestbook(eventId)`, (err) => {
        if (err) console.error('Error creating idx_guestbook_event_id:', err);
        else console.log('✓ Created idx_guestbook_event_id');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_guestbook_created_at ON guestbook(createdAt DESC)`, (err) => {
        if (err) console.error('Error creating idx_guestbook_created_at:', err);
        else console.log('✓ Created idx_guestbook_created_at');
    });

    // Indexes for comments table
    db.run(`CREATE INDEX IF NOT EXISTS idx_comments_media_id ON comments(mediaId)`, (err) => {
        if (err) console.error('Error creating idx_comments_media_id:', err);
        else console.log('✓ Created idx_comments_media_id');
    });

    // Indexes for support messages
    db.run(`CREATE INDEX IF NOT EXISTS idx_support_user_id ON support_messages(userId)`, (err) => {
        if (err) console.error('Error creating idx_support_user_id:', err);
        else console.log('✓ Created idx_support_user_id');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_support_created_at ON support_messages(createdAt DESC)`, (err) => {
        if (err) console.error('Error creating idx_support_created_at:', err);
        else console.log('✓ Created idx_support_created_at');
    });

    console.log('Performance indexes creation completed!');
};

// Analyze query performance (SQLite specific)
export const analyzeQueryPerformance = () => {
    console.log('Analyzing query performance...');

    // Enable query statistics
    db.run("PRAGMA stats = ON;", (err) => {
        if (err) console.error('Error enabling stats:', err);
    });

    // Get table statistics
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
            console.error('Error getting tables:', err);
            return;
        }

        tables.forEach(table => {
            db.run(`ANALYZE ${table.name}`, (err) => {
                if (err) console.error(`Error analyzing ${table.name}:`, err);
                else console.log(`✓ Analyzed ${table.name}`);
            });
        });
    });

    console.log('Query performance analysis completed!');
};

// Utility function to check if indexes exist
export const checkIndexes = () => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT name, tbl_name, sql
            FROM sqlite_master
            WHERE type = 'index' AND name LIKE 'idx_%'
            ORDER BY name
        `, (err, indexes) => {
            if (err) reject(err);
            else resolve(indexes);
        });
    });
};

// Export for use in other modules
export { db };