import { db } from '../config/db.js';
import { config } from '../config/env.js';
import { cacheService } from '../services/cacheService.js';

function getPublicUrl(key) { return `/api/proxy-media?key=${encodeURIComponent(key)}`; }

async function attachPublicUrls(mediaList) {
    return mediaList.map(m => ({
        ...m,
        url: getPublicUrl(m.url),
        previewUrl: m.previewUrl ? getPublicUrl(m.previewUrl) : null,
        s3Key: m.url
    }));
}

export const getEvents = async (req, res) => {
    try {
        const cacheKey = req.user.role === 'ADMIN' ? 'admin_events' : `user_events_${req.user.id}`;

        // Try to get from cache first
        let events = await cacheService.getUserEvents(req.user.role === 'ADMIN' ? 'admin' : req.user.id);

        if (!events) {
            // Cache miss - fetch from database
            console.log(`📊 Cache miss for ${cacheKey}, fetching from database`);

            // Optimized query using composite index idx_events_host_created
            const query = req.user.role === 'ADMIN'
                ? `SELECT events.*, users.tier as hostTier FROM events JOIN users ON events.hostId = users.id ORDER BY events.createdAt DESC`
                : `SELECT events.*, users.tier as hostTier FROM events JOIN users ON events.hostId = users.id WHERE events.hostId = ? ORDER BY events.createdAt DESC`;
            const params = req.user.role === 'ADMIN' ? [] : [req.user.id];

            events = await new Promise((resolve, reject) => {
                db.all(query, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            // Cache the results (5 minutes for user events, 2 minutes for admin)
            const ttl = req.user.role === 'ADMIN' ? 120 : 300;
            await cacheService.setUserEvents(req.user.role === 'ADMIN' ? 'admin' : req.user.id, events, ttl);
        } else {
            console.log(`✅ Cache hit for ${cacheKey}`);
        }

        // Process events in parallel instead of sequential Promise.all
        const detailedPromises = events.map(async (evt) => {
            // Try to get media from cache first
            let media = await cacheService.getEventMedia(evt.id);

            if (!media) {
                // Use composite index idx_media_event_uploaded for efficient ordering
                media = await new Promise(resolve => db.all("SELECT * FROM media WHERE eventId = ? ORDER BY uploadedAt DESC LIMIT 10", [evt.id], (err, rows) => resolve(rows || [])));
                // Cache media for 10 minutes
                await cacheService.setEventMedia(evt.id, media, 600);
            }

            const signedMedia = await attachPublicUrls(media);
            let signedCover = evt.coverImage;
            if (evt.coverImage && !evt.coverImage.startsWith('http')) signedCover = getPublicUrl(evt.coverImage);
            return { ...evt, media: signedMedia, coverImage: signedCover, hasPin: !!evt.pin };
        });

        const detailed = await Promise.all(detailedPromises);
        res.json(detailed);
    } catch (error) {
        console.error('Error in getEvents:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
};

export const getEventById = async (req, res) => {
    // Use index on events.id (primary key) and idx_events_expires_at for expiration check
    db.get(`SELECT events.*, users.tier as hostTier FROM events LEFT JOIN users ON events.hostId = users.id WHERE events.id = ?`, [req.params.id], async (err, evt) => {
        if (err || !evt) return res.status(404).json({ error: "Not found" });
        if (evt.expiresAt && new Date(evt.expiresAt) < new Date()) {
            return res.status(410).json({ error: "Event expired" });
        }

        // Parallel execution of independent queries using indexes
        const [mediaResult, guestbookResult] = await Promise.all([
            // Use composite index idx_media_event_uploaded
            new Promise(resolve => db.all("SELECT * FROM media WHERE eventId = ? ORDER BY uploadedAt DESC", [evt.id], (err, rows) => resolve(rows || []))),
            // Use composite index idx_guestbook_event_id and idx_guestbook_created_at
            new Promise(resolve => db.all("SELECT * FROM guestbook WHERE eventId = ? ORDER BY createdAt DESC", [evt.id], (err, rows) => resolve(rows || [])))
        ]);

        const signedMedia = await attachPublicUrls(mediaResult);
        let signedCover = evt.coverImage;
        if (evt.coverImage && !evt.coverImage.startsWith('http')) signedCover = getPublicUrl(evt.coverImage);

        res.json({ ...evt, media: signedMedia, guestbook: guestbookResult, coverImage: signedCover, hasPin: !!evt.pin, pin: undefined });
    });
};

export const createEvent = async (req, res) => {
    const e = req.body;
    if (e.hostId !== req.user.id && req.user.role !== 'ADMIN') return res.sendStatus(403);

    try {
        const stmt = db.prepare(`INSERT INTO events (id, title, description, date, city, hostId, code, expiresAt, pin, views, downloads, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        await new Promise((resolve, reject) => {
            stmt.run(e.id, e.title, e.description, e.date, e.city || null, e.hostId, e.code, e.expiresAt, e.pin, 0, 0, new Date().toISOString(), (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        stmt.finalize();

        // Invalidate user events cache
        await cacheService.invalidateUserEvents(e.hostId);
        if (req.user.role === 'ADMIN') {
            await cacheService.invalidateUserEvents('admin');
        }

        res.json(e);
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ error: error.message });
    }
};

export const updateEvent = async (req, res) => {
    const updates = req.body;
    const allowedFields = ['title', 'description', 'coverImage', 'coverMediaType', 'expiresAt', 'downloads'];

    try {
        const event = await new Promise((resolve, reject) => {
            db.get("SELECT hostId FROM events WHERE id = ?", [req.params.id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!event) return res.status(404).json({ error: "Not found" });
        if (event.hostId !== req.user.id && req.user.role !== 'ADMIN') return res.sendStatus(403);

        const fieldsToUpdate = Object.keys(updates).filter(key => allowedFields.includes(key));
        if (fieldsToUpdate.length === 0) return res.json({ success: true });

        const setClause = fieldsToUpdate.map(field => `${field} = ?`).join(', ');
        const values = fieldsToUpdate.map(field => updates[field]);
        values.push(req.params.id);

        await new Promise((resolve, reject) => {
            db.run(`UPDATE events SET ${setClause} WHERE id = ?`, values, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Invalidate caches
        await cacheService.invalidateEventDetails(req.params.id);
        await cacheService.invalidateUserEvents(event.hostId);
        if (req.user.role === 'ADMIN') {
            await cacheService.invalidateUserEvents('admin');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteEvent = (req, res) => {
    db.get("SELECT hostId FROM events WHERE id = ?", [req.params.id], (err, row) => {
        if (!row) return res.status(404).json({ error: "Not found" });
        if (row.hostId !== req.user.id && req.user.role !== 'ADMIN') return res.sendStatus(403);
        db.run("DELETE FROM events WHERE id=?", req.params.id, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
};

export const incrementView = (req, res) => {
    db.run("UPDATE events SET views = views + 1 WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
};
