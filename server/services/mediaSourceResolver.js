import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
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
const REMOTE_SOURCE_MAX_REDIRECTS = 3;

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

const parseIpv4 = (address) => {
    const parts = String(address || '').split('.');
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
        return null;
    }
    return parts.reduce((value, part) => (value << 8n) + BigInt(part), 0n);
};

const parseIpv6 = (address) => {
    let normalized = String(address || '').toLowerCase();
    if (normalized.includes('%') || net.isIP(normalized) !== 6) return null;
    const ipv4Tail = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];
    if (ipv4Tail) {
        const ipv4 = parseIpv4(ipv4Tail);
        if (ipv4 === null) return null;
        normalized = `${normalized.slice(0, -ipv4Tail.length)}${(ipv4 >> 16n).toString(16)}:${(ipv4 & 0xffffn).toString(16)}`;
    }
    const halves = normalized.split('::');
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const omitted = halves.length === 2 ? 8 - left.length - right.length : 0;
    if (omitted < 0 || (halves.length === 1 && left.length !== 8)) return null;
    const parts = [...left, ...Array(omitted).fill('0'), ...right];
    if (parts.length !== 8 || parts.some((part) => !/^[a-f0-9]{1,4}$/.test(part))) return null;
    return parts.reduce((value, part) => (value << 16n) + BigInt(`0x${part}`), 0n);
};

const ipv4Cidr = (base, prefix) => [parseIpv4(base), prefix];
const ipv6Cidr = (base, prefix) => [parseIpv6(base), prefix];
const matchesCidr = (address, [base, prefix], width) => (
    address >> BigInt(width - prefix)
) === (
    base >> BigInt(width - prefix)
);

// These ranges are not safe remote-ingestion targets even when a DNS answer
// returns them. The list deliberately includes documentation and protocol-use
// ranges in addition to the more familiar private and loopback networks.
const NON_GLOBAL_IPV4_CIDRS = [
    ipv4Cidr('0.0.0.0', 8),
    ipv4Cidr('10.0.0.0', 8),
    ipv4Cidr('100.64.0.0', 10),
    ipv4Cidr('127.0.0.0', 8),
    ipv4Cidr('169.254.0.0', 16),
    ipv4Cidr('172.16.0.0', 12),
    ipv4Cidr('192.0.0.0', 24),
    ipv4Cidr('192.0.2.0', 24),
    ipv4Cidr('192.88.99.0', 24),
    ipv4Cidr('192.168.0.0', 16),
    ipv4Cidr('198.18.0.0', 15),
    ipv4Cidr('198.51.100.0', 24),
    ipv4Cidr('203.0.113.0', 24),
    ipv4Cidr('224.0.0.0', 4),
    ipv4Cidr('240.0.0.0', 4),
];

const GLOBAL_UNICAST_IPV6 = ipv6Cidr('2000::', 3);
const NON_GLOBAL_IPV6_CIDRS = [
    // IETF protocol assignments, benchmarking, ORCHID, and other special use.
    ipv6Cidr('2001::', 23),
    ipv6Cidr('2001:db8::', 32),
    ipv6Cidr('2002::', 16),
    ipv6Cidr('3fff::', 20),
];
const IPV4_MAPPED_IPV6 = ipv6Cidr('::ffff:0:0', 96);

const normalizeIpLiteral = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized.startsWith('[') && normalized.endsWith(']')
        ? normalized.slice(1, -1)
        : normalized;
};

const isNonGlobalIp = (value) => {
    const normalized = normalizeIpLiteral(value);
    const family = net.isIP(normalized);
    if (family === 4) {
        const address = parseIpv4(normalized);
        return address === null || NON_GLOBAL_IPV4_CIDRS.some((range) => matchesCidr(address, range, 32));
    }
    if (family !== 6) return true;
    const address = parseIpv6(normalized);
    return address === null
        || matchesCidr(address, IPV4_MAPPED_IPV6, 128)
        || !matchesCidr(address, GLOBAL_UNICAST_IPV6, 128)
        || NON_GLOBAL_IPV6_CIDRS.some((range) => matchesCidr(address, range, 128));
};

const isBlockedHost = (hostname) => {
    const normalized = normalizeIpLiteral(hostname);
    if (!normalized || PRIVATE_HOSTNAMES.has(normalized) || normalized.endsWith('.local')) return true;
    return net.isIP(normalized) ? isNonGlobalIp(normalized) : false;
};

const resolveSafeSourceAddresses = async (hostname, lookupFn) => {
    let results;
    try {
        results = await lookupFn(hostname, { all: true, verbatim: true });
    } catch (error) {
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_DNS_UNAVAILABLE',
            'Approved source host could not be resolved.',
            { status: 502, details: { cause: error?.code || error?.name } },
        );
    }
    const entries = Array.isArray(results) ? results : [];
    const addresses = entries.map((entry) => {
        const address = normalizeIpLiteral(entry?.address);
        return { address, family: net.isIP(address) };
    });
    if (!addresses.length || addresses.some(({ address, family }) => !family || isNonGlobalIp(address))) {
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_NETWORK_UNSAFE',
            'Approved source host resolves to a non-global or unsafe network address.',
            { status: 422 },
        );
    }
    return addresses;
};

const createPinnedLookup = ({ hostname, address, family }) => (
    requestedHostname,
    options,
    callback,
) => {
    let lookupOptions = options;
    let done = callback;
    if (typeof options === 'function') {
        done = options;
        lookupOptions = {};
    }
    if (String(requestedHostname || '').toLowerCase() !== String(hostname || '').toLowerCase()) {
        const error = new Error('Pinned source hostname did not match the approved source host.');
        error.code = 'HERO_MEDIA_SOURCE_PIN_MISMATCH';
        done(error);
        return;
    }
    if (lookupOptions?.all) {
        done(null, [{ address, family }]);
        return;
    }
    done(null, address, family);
};

const requestPinnedSource = ({
    url,
    method,
    address,
    family,
    timeoutMs,
    httpsRequestFn,
}) => new Promise((resolve, reject) => {
    const parsed = new URL(url);
    let settled = false;
    let timeoutHandle;
    const settle = (action, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        action(value);
    };
    let request;
    try {
        request = httpsRequestFn(parsed, {
            method,
            agent: false,
            rejectUnauthorized: true,
            servername: parsed.hostname,
            lookup: createPinnedLookup({
                hostname: parsed.hostname,
                address,
                family,
            }),
            headers: {
                Host: parsed.host,
                ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}),
            },
        }, (response) => {
            const result = {
                status: response?.statusCode,
                headers: response?.headers || {},
            };
            response?.resume?.();
            response?.destroy?.();
            settle(resolve, result);
        });
    } catch (error) {
        settle(reject, error);
        return;
    }
    request.once('error', (error) => settle(reject, error));
    timeoutHandle = setTimeout(() => {
        const error = new Error('Approved source safety probe timed out.');
        error.code = 'ETIMEDOUT';
        request.destroy(error);
    }, timeoutMs);
    timeoutHandle.unref?.();
    request.end();
});

const responseHeader = (headers, name) => {
    const value = headers?.[name.toLowerCase()] ?? headers?.[name];
    return Array.isArray(value) ? value[0] : value;
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
        httpsRequestFn = httpsRequest,
        timeoutMs = REMOTE_SOURCE_PROBE_TIMEOUT_MS,
    } = {},
) => {
    const url = validateAuthorizedRemoteUrl(rawUrl, { authorizedSourceHosts });
    if (typeof httpsRequestFn !== 'function') {
        throw new MediaSourceError('HERO_MEDIA_SOURCE_PROBE_UNAVAILABLE', 'Remote source safety probe is unavailable.', {
            status: 503,
        });
    }
    const probeRedirectChain = async (initialUrl, method) => {
        let currentUrl = initialUrl;
        const visited = new Set();
        for (let redirects = 0; redirects <= REMOTE_SOURCE_MAX_REDIRECTS; redirects += 1) {
            currentUrl = validateAuthorizedRemoteUrl(currentUrl, { authorizedSourceHosts });
            if (visited.has(currentUrl)) {
                throw new MediaSourceError(
                    'HERO_MEDIA_SOURCE_REDIRECT_REJECTED',
                    'Approved source returned a redirect loop.',
                    { status: 422 },
                );
            }
            visited.add(currentUrl);
            const parsed = new URL(currentUrl);
            const [{ address, family }] = await resolveSafeSourceAddresses(parsed.hostname, lookupFn);
            let response;
            try {
                response = await requestPinnedSource({
                    url: currentUrl,
                    method,
                    address,
                    family,
                    timeoutMs,
                    httpsRequestFn,
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
            if (response.status < 300 || response.status >= 400) {
                return { response, url: currentUrl };
            }
            const location = responseHeader(response.headers, 'location');
            if (redirects === REMOTE_SOURCE_MAX_REDIRECTS || typeof location !== 'string' || !location.trim()) {
                throw new MediaSourceError(
                    'HERO_MEDIA_SOURCE_REDIRECT_REJECTED',
                    'Approved source returned an invalid or excessive redirect chain.',
                    { status: 422 },
                );
            }
            try {
                currentUrl = validateAuthorizedRemoteUrl(
                    new URL(location, currentUrl).toString(),
                    { authorizedSourceHosts },
                );
            } catch (error) {
                if (!(error instanceof MediaSourceError)) throw error;
                throw new MediaSourceError(
                    'HERO_MEDIA_SOURCE_REDIRECT_REJECTED',
                    'Approved source redirected outside the authorized source policy.',
                    { status: 422 },
                );
            }
        }
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_REDIRECT_REJECTED',
            'Approved source returned an excessive redirect chain.',
            { status: 422 },
        );
    };

    let result = await probeRedirectChain(url, 'HEAD');
    // Some CDNs intentionally deny HEAD. Probe the final approved URL using a
    // one-byte GET, with a fresh validated and pinned resolution for each hop.
    if (result.response.status === 405) result = await probeRedirectChain(result.url, 'GET');
    if (result.response.status < 200 || result.response.status >= 300) {
        throw new MediaSourceError(
            'HERO_MEDIA_SOURCE_UNREACHABLE',
            'Approved source is not available for ingestion.',
            { status: 422 },
        );
    }
    return result.url;
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
