// Clerk copies a Google profile picture only when the account is created through
// "Continue with Google". An account made with email or username and linked to
// Google later keeps the default avatar forever, so this fills the gap once.

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// The URL comes from Clerk, but it is still fetched by the server, so it is held
// to known image hosts: an arbitrary URL here would let the server be pointed at
// internal addresses.
const isAllowedImageHost = (hostname) => (
    hostname === 'img.clerk.com'
    || hostname === 'googleusercontent.com'
    || hostname.endsWith('.googleusercontent.com')
);

export class AvatarSyncError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'AvatarSyncError';
        this.code = code;
    }
}

const isGoogleAccount = (account) => ['google', 'oauth_google'].includes(String(account?.provider || ''));

export const findGoogleAvatarUrl = (user) => {
    const account = (user?.externalAccounts || []).find((item) => isGoogleAccount(item) && item.imageUrl);
    if (!account) return null;
    try {
        const url = new URL(account.imageUrl);
        if (url.protocol !== 'https:' || !isAllowedImageHost(url.hostname)) return null;
        // Google serves a 96px thumbnail by default; ask for a size that stays sharp.
        if (url.hostname.endsWith('googleusercontent.com')) {
            url.pathname = url.pathname.replace(/=s\d+(-c)?$/, '=s400-c');
        }
        return url.toString();
    } catch {
        return null;
    }
};

const downloadImage = async (url, fetchImpl) => {
    const response = await fetchImpl(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const finalHost = new URL(response.url || url).hostname;
    if (!isAllowedImageHost(finalHost)) {
        throw new AvatarSyncError('The avatar redirected to an unexpected host.', 'AVATAR_HOST_REJECTED');
    }
    if (!response.ok) {
        throw new AvatarSyncError(`The avatar request failed with ${response.status}.`, 'AVATAR_FETCH_FAILED');
    }
    const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(type)) {
        throw new AvatarSyncError('The avatar is not a supported image.', 'AVATAR_TYPE_REJECTED');
    }
    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_IMAGE_BYTES) {
        throw new AvatarSyncError('The avatar is too large.', 'AVATAR_TOO_LARGE');
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
        throw new AvatarSyncError('The avatar is empty or too large.', 'AVATAR_TOO_LARGE');
    }
    return new Blob([bytes], { type });
};

/**
 * Sets the user's Clerk profile picture from their linked Google account when
 * they still have the default one. Never replaces a picture the user chose.
 */
export const syncGoogleAvatar = async ({ userId, users, fetchImpl = fetch }) => {
    const user = await users.getUser(userId);
    if (user.hasImage) return { updated: false, reason: 'HAS_IMAGE' };

    const avatarUrl = findGoogleAvatarUrl(user);
    if (!avatarUrl) return { updated: false, reason: 'NO_GOOGLE_AVATAR' };

    const file = await downloadImage(avatarUrl, fetchImpl);
    const updatedUser = await users.updateUserProfileImage(userId, { file });
    return { updated: true, imageUrl: updatedUser?.imageUrl || null };
};
