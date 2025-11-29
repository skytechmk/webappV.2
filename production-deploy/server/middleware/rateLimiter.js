import rateLimit from 'express-rate-limit';

export const RateLimitStore = {
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

export const checkRateLimit = (store, key, limit, windowMs) => {
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

export const pinRateLimiter = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(RateLimitStore.pin, ip, 5, 15 * 60 * 1000)) {
        return res.status(429).json({ error: "Too many failed attempts. Please try again in 15 minutes." });
    }
    next();
};

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests from this IP, please try again later." },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { trustProxy: false }
});

export const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: "AI request limit exceeded. Please try again in an hour." },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { trustProxy: false }
});

export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    message: { error: "Upload limit exceeded. Please try again in an hour." },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { trustProxy: false }
});
