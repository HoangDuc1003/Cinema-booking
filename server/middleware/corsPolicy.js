import cors from 'cors';

export const PRODUCTION_CLIENT_ORIGIN = 'https://nitrocine.vercel.app';

export const LOCAL_CLIENT_ORIGINS = Object.freeze([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]);

const CORS_ORIGIN_DENIED = 'CORS_ORIGIN_DENIED';

const normalizeHttpOrigin = (value, variableName) => {
    const candidate = value?.trim();
    if (!candidate) return null;

    let parsed;
    try {
        parsed = new URL(candidate);
    } catch {
        throw new Error(`${variableName} contains an invalid URL.`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`${variableName} origins must use http or https.`);
    }

    return parsed.origin;
};

export const getAllowedCorsOrigins = (env = process.env) => {
    const origins = new Set([PRODUCTION_CLIENT_ORIGIN]);

    // Local origins are intentionally available only outside production.
    if (env.NODE_ENV !== 'production') {
        LOCAL_CLIENT_ORIGINS.forEach((origin) => origins.add(origin));
    }

    const configuredOrigins = [
        env.CLIENT_URL,
        ...(env.CORS_ALLOWED_ORIGINS?.split(',') || []),
    ];

    configuredOrigins.forEach((value) => {
        const origin = normalizeHttpOrigin(value, 'CORS_ALLOWED_ORIGINS');
        if (origin) origins.add(origin);
    });

    return origins;
};

export const createCorsOptions = (env = process.env) => {
    const allowedOrigins = getAllowedCorsOrigins(env);

    return {
        origin(requestOrigin, callback) {
            // Requests from Stripe, health probes and other server-to-server clients
            // do not carry Origin and must continue to work.
            if (!requestOrigin) {
                callback(null, true);
                return;
            }

            let normalizedRequestOrigin;
            try {
                normalizedRequestOrigin = normalizeHttpOrigin(requestOrigin, 'Origin');
            } catch {
                normalizedRequestOrigin = null;
            }

            if (normalizedRequestOrigin && allowedOrigins.has(normalizedRequestOrigin)) {
                callback(null, true);
                return;
            }

            const error = new Error('Origin is not allowed by the CORS policy.');
            error.code = CORS_ORIGIN_DENIED;
            error.statusCode = 403;
            callback(error);
        },
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        optionsSuccessStatus: 204,
        maxAge: 86400,
    };
};

export const createCorsMiddleware = (env = process.env) => cors(createCorsOptions(env));

export const handleCorsError = (error, req, res, next) => {
    if (error?.code !== CORS_ORIGIN_DENIED) {
        next(error);
        return;
    }

    // A shared cache must never reuse a denial for a different Origin.
    res.vary('Origin');
    res.set('Cache-Control', 'private, no-store');
    res.status(403).json({
        success: false,
        message: 'Origin is not allowed by the CORS policy.',
    });
};
