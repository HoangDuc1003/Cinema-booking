import test from 'node:test';
import assert from 'node:assert/strict';
import { getCloudinaryConfigStatus } from '../configs/cloudinary.js';

test('Cloudinary status reports only required variable presence', () => {
    assert.deepEqual(getCloudinaryConfigStatus({}), {
        configured: false,
        variables: { cloudName: false, apiKey: false, apiSecret: false },
    });

    assert.deepEqual(getCloudinaryConfigStatus({
        CLOUDINARY_NAME: 'nitrocine',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_SECRET_KEY: 'secret',
    }), {
        configured: true,
        variables: { cloudName: true, apiKey: true, apiSecret: true },
    });
});
