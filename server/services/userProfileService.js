import { randomUUID } from 'node:crypto';

export const ALLOWED_PROFILE_AVATARS = Object.freeze([
    'nitro-red',
    'nitro-violet',
    'nitro-blue',
    'nitro-amber',
    'nitro-mint',
]);

export class ProfileValidationError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'ProfileValidationError';
        this.status = status;
    }
}

const normalizeName = (value) => {
    if (typeof value !== 'string') throw new ProfileValidationError('Profile name is required.');
    const name = value.trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > 20) {
        throw new ProfileValidationError('Profile name must contain between 1 and 20 characters.');
    }
    return name;
};

const normalizeAvatarId = (value) => {
    if (!ALLOWED_PROFILE_AVATARS.includes(value)) {
        throw new ProfileValidationError('Profile avatar is not allowed.');
    }
    return value;
};

const normalizeProfile = (profile, { requireId = true } = {}) => {
    const id = typeof profile?.id === 'string' ? profile.id.trim() : '';
    if (requireId && !id) throw new ProfileValidationError('Profile ID is invalid.');
    return {
        ...(id ? { id } : {}),
        name: normalizeName(profile?.name),
        avatarId: normalizeAvatarId(profile?.avatarId),
        isKids: profile?.isKids === true,
    };
};

export const sanitizeProfiles = (profiles = []) => {
    if (!Array.isArray(profiles)) return [];
    const sanitized = [];
    const seen = new Set();
    for (const profile of profiles) {
        try {
            const normalized = normalizeProfile(profile);
            if (seen.has(normalized.id)) continue;
            seen.add(normalized.id);
            sanitized.push(normalized);
        } catch {
            // Invalid legacy metadata is ignored instead of being returned to clients.
        }
        if (sanitized.length === 5) break;
    }
    return sanitized;
};

export const createDefaultProfile = (displayName = 'Bạn') => ({
    id: randomUUID(),
    name: normalizeName(String(displayName || 'Bạn').trim().slice(0, 20) || 'Bạn'),
    avatarId: ALLOWED_PROFILE_AVATARS[0],
    isKids: false,
});

export const createProfileCollection = (profiles, input) => {
    const current = sanitizeProfiles(profiles);
    if (current.length >= 5) throw new ProfileValidationError('A maximum of five profiles is allowed.', 409);
    const profile = normalizeProfile(input, { requireId: false });
    return [...current, { id: randomUUID(), ...profile }];
};

export const updateProfileCollection = (profiles, profileId, input) => {
    const current = sanitizeProfiles(profiles);
    const index = current.findIndex((profile) => profile.id === profileId);
    if (index < 0) throw new ProfileValidationError('Profile was not found.', 404);
    const next = [...current];
    next[index] = normalizeProfile({
        ...current[index],
        ...(Object.hasOwn(input || {}, 'name') ? { name: input.name } : {}),
        ...(Object.hasOwn(input || {}, 'avatarId') ? { avatarId: input.avatarId } : {}),
        ...(Object.hasOwn(input || {}, 'isKids') ? { isKids: input.isKids === true } : {}),
    });
    return next;
};

export const deleteProfileFromCollection = (profiles, profileId) => {
    const current = sanitizeProfiles(profiles);
    if (current.length <= 1) throw new ProfileValidationError('The final profile cannot be deleted.', 409);
    const next = current.filter((profile) => profile.id !== profileId);
    if (next.length === current.length) throw new ProfileValidationError('Profile was not found.', 404);
    return next;
};
