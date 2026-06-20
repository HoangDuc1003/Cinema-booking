export class RuntimeConfigError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'RuntimeConfigError';
        this.code = code;
        this.statusCode = 503;
    }
}

const normalizeHttpUrl = (value, variableName) => {
    if (!value) return null;
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new RuntimeConfigError(`${variableName} must be a valid URL.`, `${variableName}_INVALID`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new RuntimeConfigError(`${variableName} must use http or https.`, `${variableName}_INVALID`);
    }
    return parsed.origin;
};

export const getConfiguredClientUrl = (env = process.env) => {
    const clientUrl = normalizeHttpUrl(env.CLIENT_URL?.trim(), 'CLIENT_URL');
    if (!clientUrl && env.NODE_ENV === 'production') {
        throw new RuntimeConfigError('CLIENT_URL must be configured in production.', 'CLIENT_URL_MISSING');
    }
    return clientUrl;
};

export const getClientOrigin = (req, env = process.env) => {
    const configured = getConfiguredClientUrl(env);
    if (configured) return configured;

    const candidate = req?.headers?.origin
        || (req?.headers?.referer ? new URL(req.headers.referer).origin : null)
        || `${req?.protocol || 'http'}://${req?.headers?.host || '127.0.0.1:3000'}`;
    return normalizeHttpUrl(candidate, 'REQUEST_ORIGIN');
};

export const requireStripeSecret = (env = process.env) => {
    if (!env.STRIPE_SECRET_KEY?.trim()) {
        throw new RuntimeConfigError('STRIPE_SECRET_KEY is not configured.', 'STRIPE_SECRET_KEY_MISSING');
    }
    return env.STRIPE_SECRET_KEY.trim();
};

export const requireStripeWebhookSecret = (env = process.env) => {
    if (!env.STRIPE_WEBHOOK_SECRET?.trim()) {
        throw new RuntimeConfigError('STRIPE_WEBHOOK_SECRET is not configured.', 'STRIPE_WEBHOOK_SECRET_MISSING');
    }
    return env.STRIPE_WEBHOOK_SECRET.trim();
};

export const getPaymentConfigStatus = (env = process.env) => {
    let clientUrlConfigured = false;
    try {
        clientUrlConfigured = Boolean(normalizeHttpUrl(env.CLIENT_URL?.trim(), 'CLIENT_URL'));
    } catch {
        clientUrlConfigured = false;
    }
    return {
        stripe: { configured: Boolean(env.STRIPE_SECRET_KEY?.trim()) },
        clientUrl: { configured: clientUrlConfigured },
    };
};
