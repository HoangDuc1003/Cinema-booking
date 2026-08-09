import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import {
    HERO_MEDIA_RIGHTS_STATUSES,
    HERO_MEDIA_SOURCE_TYPES,
} from '../models/HeroMediaAsset.js';

const INGESTIBLE_RIGHTS = new Set(['AUTHORIZED', 'USER_OWNED', 'LICENSED']);
const INGESTIBLE_SOURCE_TYPES = new Set([
    'AUTHORIZED_REMOTE_URL',
    'USER_STORAGE',
    'ADMIN_UPLOAD',
    'LICENSED_PROVIDER',
]);
const PRIVATE_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);
const REMOTE_SOURCE_PROBE_TIMEOUT_MS = 10_000;

export class MediaSourceError extends Error {
    constructor(code, message, { status = 400, details } = {}) {
        super(message);
        this.name = 'MediaSourceError';
        this.code = code;
        this.status = status;
        this.statusCode = status;
        this.details = details;
    }
}

const normalizeEnum = (value, values, field) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!values.includes(normalized)) {
        throw new MediaSourceError('HERO_MEDIA_SOURCE_INVALID', `${field} is invalid.`, {
            details: { field },
        });
    }
    return normalized;
};

const isPrivateIpv4 = (host) => {
    const parts = host.split('.').map(Number);
    return parts.length === 4 && (
        parts[0] === 10
        || parts[0] === 127
        || parts[0] === 0
        || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
        || (parts[0] === 169 && parts[1] === 254)
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168)
        || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
    );
};

const isBlockedHost = (hostname) => {
    const normalized = String(hostname || '').toLowerCase();
    if (!normalized || PRIVATE_HOSTNAMES.has(normalized) || normalized.endsWith('.local')) return true;
    if (net.isIP(normalized) === 4) return isPrivateIpv4(normalized);
    if (net.isIP(normalized) !== 6) return false;
    const ipv4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(normalized)?.[1];
    return Boolean(
        (ipv4Mapped && isPrivateIpv4(ipv4Mapped))
        || normalized === '::1'
        || normalized.startsWith('fe80:')
        || normalized.startsWith('fc')
        || normalized.startsWith('fd')
    );
};

const normalizeAllowedSourceHosts = (value = process.env.HERO_MEDIA_AUTHORIZED_SOURCE_HOSTS) => {
    const values = Array.isArray(value) ? value : String(value || '').split(',');
    const hosts = values
        .map((host) => String(host || '').trim().toLowerCase())
        .filter(Boolean);
    if (hosts.some((host) => (
        host.length > 253
        || host.includes('://')
        || host.includes('/')
        || host.includes(':')
        || !/^[a-z0-9.-]+$/.test(host)
        || host.startsWith('.')
        || host.endsWith('.')
        || host.includes('..')
    ))) {
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_HOSTS_INVALID',
            'Authorized source hosts must be a comma-separated list of hostnames.',
            { status: 503 },
        );
    }
    return new Set(hosts);
};

export const hashMediaSourceUrl = (url) => createHash('sha256')
    .update(String(url || '').trim())
    .digest('hex');

export const validateAuthorizedRemoteUrl = (rawUrl, { authorizedSourceHosts } = {}) => {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || '').trim());
    } catch {
        throw new MediaSourceError('HERO_MEDIA_URL_INVALID', 'Source URL must be a valid HTTPS URL.');
    }
    if (
        parsed.protocol !== 'https:'
        || parsed.username
        || parsed.password
        || (parsed.port && parsed.port !== '443')
        || isBlockedHost(parsed.hostname)
    ) {
        throw new MediaSourceError(
            'HERO_MEDIA_URL_UNSAFE',
            'Source URL must use a public HTTPS host without embedded credentials.',
        );
    }
    const allowedHosts = normalizeAllowedSourceHosts(authorizedSourceHosts);
    if (!allowedHosts.size) {
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_HOSTS_NOT_CONFIGURED',
            'Remote ingestion is disabled until an authorized source host is configured.',
            { status: 503 },
        );
    }
    if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_HOST_NOT_ALLOWED',
            'Source URL host is not an approved media source.',
            { status: 422 },
        );
    }
    return parsed.toString();
};

export const assertAuthorizedRemoteSourceNetworkSafe = async (
    rawUrl,
    {
        authorizedSourceHosts,
        lookupFn = lookup,
        fetchFn = globalThis.fetch,
        timeoutMs = REMOTE_SOURCE_PROBE_TIMEOUT_MS,
    } = {},
) => {
    const url = validateAuthorizedRemoteUrl(rawUrl, { authorizedSourceHosts });
    const parsed = new URL(url);
    let addresses;
    try {
        addresses = await lookupFn(parsed.hostname, { all: true, verbatim: true });
    } catch (error) {
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_DNS_UNAVAILABLE',
            'Approved source host could not be resolved.',
            { status: 502, details: { cause: error?.code || error?.name } },
        );
    }
    if (!addresses.length || addresses.some((entry) => isBlockedHost(entry.address))) {
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_NETWORK_UNSAFE',
            'Approved source host resolves to a private or unsafe network address.',
            { status: 422 },
        );
    }
    if (typeof fetchFn !== 'function') {
        throw new MediaSourceError('HERO_MEDIA_SOURCE_PROBE_UNAVAILABLE', 'Remote source safety probe is unavailable.', {
            status: 503,
        });
    }
    const probe = async (method) => {
        let response;
        try {
            response = await fetchFn(url, {
                method,
                redirect: 'manual',
                signal: AbortSignal.timeout(timeoutMs),
                ...(method === 'GET' ? { headers: { Range: 'bytes=0-0' } } : {}),
            });
        } catch (error) {
            throw new MediaSourceError(
                'HERO_MEDIA_SOURCE_UNREACHABLE',
                'Approved source could not be reached for a safe remote-ingestion check.',
                { status: 502, details: { cause: error?.code || error?.name } },
            );
        }
        if (!Number.isInteger(response?.status)) {
            throw new MediaSourceError(
                'HERO_MEDIA_SOURCE_UNREACHABLE',
                'Approved source returned an invalid safety-probe response.',
                { status: 502 },
            );
        }
        await response.body?.cancel?.().catch(() => undefined);
        return response;
    };
    let response = await probe('HEAD');
    // Some CDNs intentionally deny HEAD. Probe the actual GET behavior with a
    // one-byte range so a redirect cannot bypass the server-side policy.
    if (response.status === 405) response = await probe('GET');
    if (response.status >= 300 && response.status < 400) {
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_REDIRECT_REJECTED',
            'Approved source must not redirect before Cloudinary ingestion.',
            { status: 422 },
        );
    }
    if (response.status >= 400 && response.status !== 405) {
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_UNREACHABLE',
            'Approved source is not available for ingestion.',
            { status: 422 },
        );
    }
    return url;
};

/**
 * Keeps source resolution independent from the Hero rotation and makes the
 * authorization decision explicit before Cloudinary receives a URL.
 */
export const resolveMediaSource = ({
    movieId,
    sourceType,
    sourceProvider,
    sourceReference,
    sourceUrl,
    rightsStatus,
    provenance,
    expiresAt,
    authorizedSourceHosts,
} = {}) => {
    const id = String(movieId || '').trim();
    if (!id || id.length > 160) {
        throw new MediaSourceError('HERO_MEDIA_MOVIE_ID_INVALID', 'Movie ID is invalid.');
    }
    const type = normalizeEnum(sourceType, HERO_MEDIA_SOURCE_TYPES, 'sourceType');
    const rights = normalizeEnum(rightsStatus, HERO_MEDIA_RIGHTS_STATUSES, 'rightsStatus');
    const reference = String(sourceReference || '').trim().slice(0, 512);
    const provider = String(sourceProvider || '').trim().slice(0, 120);
    const sourceIsYouTubeReference = type === 'YOUTUBE_REFERENCE_ONLY';
    const sourceIsCloudinary = type === 'CLOUDINARY_EXISTING';

    if (sourceIsYouTubeReference) {
        return {
            movieId: id,
            sourceType: type,
            sourceProvider: provider || 'youtube',
            sourceReference: reference,
            downloadableUrl: '',
            originalUrlHash: '',
            rightsStatus: rights,
            provenance: provenance || null,
            expiresAt: expiresAt || null,
            ingestionAllowed: false,
            sourceStatus: 'needs_authorized_source',
        };
    }

    if (sourceIsCloudinary) {
        if (!reference) {
            throw new MediaSourceError('HERO_MEDIA_REFERENCE_REQUIRED', 'Cloudinary source reference is required.');
        }
        return {
            movieId: id,
            sourceType: type,
            sourceProvider: provider || 'cloudinary',
            sourceReference: reference,
            downloadableUrl: '',
            originalUrlHash: '',
            rightsStatus: rights,
            provenance: provenance || null,
            expiresAt: expiresAt || null,
            ingestionAllowed: false,
            sourceStatus: INGESTIBLE_RIGHTS.has(rights) ? 'ready_for_ingestion' : 'needs_authorized_source',
        };
    }

    const downloadableUrl = validateAuthorizedRemoteUrl(sourceUrl, { authorizedSourceHosts });
    return {
        movieId: id,
        sourceType: type,
        sourceProvider: provider || 'admin-approved',
        sourceReference: reference || hashMediaSourceUrl(downloadableUrl).slice(0, 24),
        downloadableUrl,
        originalUrlHash: hashMediaSourceUrl(downloadableUrl),
        rightsStatus: rights,
        provenance: provenance || null,
        expiresAt: expiresAt || null,
        ingestionAllowed: INGESTIBLE_SOURCE_TYPES.has(type) && INGESTIBLE_RIGHTS.has(rights),
        sourceStatus: INGESTIBLE_RIGHTS.has(rights) ? 'ready_for_ingestion' : 'needs_authorized_source',
    };
};

export const assertMediaSourceMayIngest = (source) => {
    if (!source?.ingestionAllowed) {
        throw new MediaSourceError(
            'HERO_MEDIA_RIGHTS_NOT_APPROVED',
            'Only explicitly authorized, user-owned, or licensed native sources may be ingested.',
            { status: 422 },
        );
    }
    return true;
};

export const isTransientMediaError = (error) => (
    error?.code === 'ETIMEDOUT'
    || error?.code === 'ECONNRESET'
    || error?.code === 'EAI_AGAIN'
    || error?.name === 'TimeoutError'
    || error?.http_code >= 500
    || error?.status >= 500
);

export default {
    resolveMediaSource,
    validateAuthorizedRemoteUrl,
    assertAuthorizedRemoteSourceNetworkSafe,
    assertMediaSourceMayIngest,
};
