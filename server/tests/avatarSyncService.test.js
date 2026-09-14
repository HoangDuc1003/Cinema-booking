import assert from 'node:assert/strict';
import test from 'node:test';
import { AvatarSyncError, findGoogleAvatarUrl, syncGoogleAvatar } from '../services/avatarSyncService.js';

const GOOGLE_AVATAR = 'https://lh3.googleusercontent.com/a/ACg8ocK-example=s96-c';

const userWith = (overrides = {}) => ({
    id: 'user_1',
    hasImage: false,
    externalAccounts: [{ provider: 'oauth_google', imageUrl: GOOGLE_AVATAR }],
    ...overrides,
});

const fakeUsers = (user) => {
    const calls = { uploads: [] };
    return {
        calls,
        getUser: async () => user,
        updateUserProfileImage: async (userId, { file }) => {
            calls.uploads.push({ userId, file });
            return { imageUrl: 'https://img.clerk.com/new-avatar' };
        },
    };
};

const imageResponse = ({ url = GOOGLE_AVATAR, status = 200, type = 'image/jpeg', bytes = 2048 } = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Headers({ 'content-type': type, 'content-length': String(bytes) }),
    arrayBuffer: async () => new ArrayBuffer(bytes),
});

test('a default avatar is replaced by the linked Google picture at a sharper size', async () => {
    const users = fakeUsers(userWith());
    let requested;
    const result = await syncGoogleAvatar({
        userId: 'user_1',
        users,
        fetchImpl: async (url) => { requested = url; return imageResponse(); },
    });

    assert.equal(result.updated, true);
    assert.equal(requested, 'https://lh3.googleusercontent.com/a/ACg8ocK-example=s400-c');
    assert.equal(users.calls.uploads.length, 1);
    assert.equal(users.calls.uploads[0].userId, 'user_1');
    assert.equal(users.calls.uploads[0].file.type, 'image/jpeg');
    assert.equal(users.calls.uploads[0].file.size, 2048);
});

test('a picture the user already has is never replaced', async () => {
    const users = fakeUsers(userWith({ hasImage: true }));
    const result = await syncGoogleAvatar({
        userId: 'user_1',
        users,
        fetchImpl: async () => { throw new Error('must not fetch'); },
    });
    assert.deepEqual(result, { updated: false, reason: 'HAS_IMAGE' });
    assert.equal(users.calls.uploads.length, 0);
});

test('nothing happens without a linked Google account that has a picture', async () => {
    for (const externalAccounts of [[], [{ provider: 'oauth_github', imageUrl: GOOGLE_AVATAR }], [{ provider: 'google', imageUrl: '' }]]) {
        const users = fakeUsers(userWith({ externalAccounts }));
        const result = await syncGoogleAvatar({ userId: 'user_1', users, fetchImpl: async () => imageResponse() });
        assert.deepEqual(result, { updated: false, reason: 'NO_GOOGLE_AVATAR' });
        assert.equal(users.calls.uploads.length, 0);
    }
});

test('only https URLs on known image hosts are ever fetched', () => {
    const urlFor = (imageUrl) => findGoogleAvatarUrl(userWith({ externalAccounts: [{ provider: 'google', imageUrl }] }));
    assert.equal(urlFor('http://lh3.googleusercontent.com/a/x'), null);
    assert.equal(urlFor('https://169.254.169.254/latest/meta-data'), null);
    assert.equal(urlFor('https://evil.example/googleusercontent.com/a.jpg'), null);
    assert.equal(urlFor('https://googleusercontent.com.evil.example/a.jpg'), null);
    assert.equal(urlFor('not a url'), null);
    assert.equal(urlFor('https://img.clerk.com/eyJ0eXBlIjoicHJveHkifQ'), 'https://img.clerk.com/eyJ0eXBlIjoicHJveHkifQ');
});

test('a redirect off the allowed hosts, a non-image, or an oversized file is rejected before upload', async () => {
    const cases = [
        { response: imageResponse({ url: 'http://internal.local/avatar.jpg' }), code: 'AVATAR_HOST_REJECTED' },
        { response: imageResponse({ type: 'text/html' }), code: 'AVATAR_TYPE_REJECTED' },
        { response: imageResponse({ bytes: 6 * 1024 * 1024 }), code: 'AVATAR_TOO_LARGE' },
        { response: imageResponse({ status: 404 }), code: 'AVATAR_FETCH_FAILED' },
    ];
    for (const { response, code } of cases) {
        const users = fakeUsers(userWith());
        await assert.rejects(
            syncGoogleAvatar({ userId: 'user_1', users, fetchImpl: async () => response }),
            (error) => error instanceof AvatarSyncError && error.code === code,
        );
        assert.equal(users.calls.uploads.length, 0, `${code} must not upload`);
    }
});
