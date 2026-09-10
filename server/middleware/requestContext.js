import { randomUUID } from 'node:crypto';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;

/**
 * Accepts a caller-supplied `x-request-id` only when it is short and safe to
 * echo into headers and logs; otherwise mints one. Shared by the app-level
 * middleware and controllers so a request keeps a single identity end to end.
 */
export const requestIdFor = (req) => {
    if (req?.requestId) return req.requestId;
    const candidate = String(req?.get?.('x-request-id') || '');
    return SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();
};

export const requestContext = (req, res, next) => {
    req.requestId = requestIdFor(req);
    res.set('X-Request-Id', req.requestId);
    next();
};

export default requestContext;
