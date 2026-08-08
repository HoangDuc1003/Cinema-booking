import { Readable } from 'node:stream';

const CLERK_FAPI_DEFAULT = 'https://frontend-api.clerk.dev';
const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
]);

export const config = {
    api: {
        bodyParser: false,
    },
};

const firstHeaderValue = (headers, names) => {
    for (const name of names) {
        const value = headers?.[name];
        if (Array.isArray(value) && value.length) return String(value[0]);
        if (value) return String(value);
    }
    return '';
};

const getClientIp = (req) => {
    const trustedValue = firstHeaderValue(req.headers, [
        'x-vercel-forwarded-for',
        'x-real-ip',
        'x-forwarded-for',
    ]);
    return trustedValue.split(',')[0].trim();
};

const getRequestUrl = (req) => new URL(
    req.url || '/',
    `https://${firstHeaderValue(req.headers, ['host']) || 'localhost'}`,
);

const getClerkPath = (req) => {
    const requestUrl = getRequestUrl(req);
    const routedPath = requestUrl.searchParams.get('_clerk_path');
    if (routedPath) return routedPath.startsWith('/') ? routedPath : `/${routedPath}`;
    return '/';
};

const getProxyUrl = (req, env) => {
    const configured = String(env.CLERK_PROXY_URL || '').trim();
    if (configured) return configured;

    const requestUrl = getRequestUrl(req);
    return `${requestUrl.origin}/__clerk`;
};

const getUpstreamUrl = (req, env) => {
    const fapi = new URL(String(env.CLERK_FAPI || CLERK_FAPI_DEFAULT).trim());
    const requestUrl = getRequestUrl(req);
    const query = new URLSearchParams(requestUrl.search);
    query.delete('_clerk_path');
    fapi.pathname = getClerkPath(req);
    fapi.search = query.toString();
    return fapi;
};

const getForwardHeaders = (req, proxyUrl, secretKey) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers || {})) {
        const lowerName = name.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(lowerName) || lowerName === 'host' || lowerName === 'content-length') {
            continue;
        }
        if (Array.isArray(value)) headers.set(name, value.join(', '));
        else if (value !== undefined) headers.set(name, String(value));
    }

    headers.set('Clerk-Proxy-Url', proxyUrl);
    headers.set('Clerk-Secret-Key', secretKey);
    headers.set('X-Forwarded-For', getClientIp(req));
    return headers;
};

const rewriteRedirect = (location, upstreamUrl, proxyUrl) => {
    try {
        const target = new URL(location, upstreamUrl);
        if (target.origin !== upstreamUrl.origin) return location;

        const proxy = new URL(proxyUrl);
        proxy.pathname = `${proxy.pathname.replace(/\/$/, '')}${target.pathname}`;
        proxy.search = target.search;
        proxy.hash = target.hash;
        return proxy.toString();
    } catch {
        return location;
    }
};

const copyResponseHeaders = (res, upstream, upstreamUrl, proxyUrl) => {
    let setCookies = [];
    for (const [name, value] of upstream.headers.entries()) {
        const lowerName = name.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(lowerName)) continue;
        if (lowerName === 'set-cookie') {
            setCookies = typeof upstream.headers.getSetCookie === 'function'
                ? upstream.headers.getSetCookie()
                : [value];
            continue;
        }
        res.setHeader(
            name,
            lowerName === 'location' ? rewriteRedirect(value, upstreamUrl, proxyUrl) : value,
        );
    }
    if (setCookies.length) res.setHeader('set-cookie', setCookies);
};

export const handleClerkProxy = async (req, res, env = globalThis.process?.env || {}) => {
    const secretKey = String(env.CLERK_SECRET_KEY || '').trim();
    if (!secretKey) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'CLERK_PROXY_NOT_CONFIGURED' }));
        return;
    }

    try {
        const upstreamUrl = getUpstreamUrl(req, env);
        const proxyUrl = getProxyUrl(req, env);
        const method = String(req.method || 'GET').toUpperCase();
        const body = BODYLESS_METHODS.has(method) ? undefined : req;
        const upstream = await fetch(upstreamUrl, {
            method,
            headers: getForwardHeaders(req, proxyUrl, secretKey),
            body,
            redirect: 'manual',
            ...(body ? { duplex: 'half' } : {}),
        });

        res.statusCode = upstream.status;
        copyResponseHeaders(res, upstream, upstreamUrl, proxyUrl);
        if (method === 'HEAD' || !upstream.body) {
            res.end();
            return;
        }
        Readable.fromWeb(upstream.body).pipe(res);
    } catch {
        res.statusCode = 502;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'CLERK_PROXY_UPSTREAM_ERROR' }));
    }
};

export default handleClerkProxy;
