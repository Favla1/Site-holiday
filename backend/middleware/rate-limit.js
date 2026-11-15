const stores = new Map();

function getClientIp(req) {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwardedFor) return forwardedFor;
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

function getRequestKey(req, keyBuilder) {
    if (typeof keyBuilder === 'function') {
        const custom = String(keyBuilder(req) || '').trim();
        if (custom) return custom;
    }
    return getClientIp(req);
}

export function createRateLimiter(options = {}) {
    const {
        id = 'default',
        windowMs = 60_000,
        max = 30,
        keyBuilder
    } = options;

    if (!stores.has(id)) {
        stores.set(id, new Map());
    }

    const store = stores.get(id);

    return (req, res, next) => {
        const now = Date.now();
        const key = getRequestKey(req, keyBuilder);
        const record = store.get(key);

        if (!record || now - record.windowStart >= windowMs) {
            store.set(key, { count: 1, windowStart: now });
            return next();
        }

        record.count += 1;
        store.set(key, record);

        if (record.count > max) {
            const retryAfterMs = Math.max(0, windowMs - (now - record.windowStart));
            const retryAfterSec = Math.ceil(retryAfterMs / 1000);
            res.setHeader('Retry-After', String(retryAfterSec));
            return res.status(429).json({
                success: false,
                message: `Muitas tentativas. Tente novamente em ${retryAfterSec}s`
            });
        }

        next();
    };
}

export const loginRateLimiter = createRateLimiter({
    id: 'auth-login',
    windowMs: 10 * 60 * 1000,
    max: 12,
    keyBuilder: (req) => {
        const ip = getClientIp(req);
        const identifier = String(req.body?.nickname || '').trim().toLowerCase();
        return `${ip}:${identifier}`;
    }
});

// Rate limiter para comentários (10 comentários por minuto por usuário)
export const commentRateLimiter = createRateLimiter({
    id: 'comments',
    windowMs: 60 * 1000,
    max: 10,
    keyBuilder: (req) => {
        return String(req.user?.id || 'anon');
    }
});

// Rate limiter para reações (30 reações por minuto por usuário)
export const reactionRateLimiter = createRateLimiter({
    id: 'reactions',
    windowMs: 60 * 1000,
    max: 30,
    keyBuilder: (req) => {
        return String(req.user?.id || 'anon');
    }
});

// Rate limiter para postagens (5 postagens por hora por usuário)
export const postRateLimiter = createRateLimiter({
    id: 'posts',
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyBuilder: (req) => {
        return String(req.user?.id || 'anon');
    }
});

