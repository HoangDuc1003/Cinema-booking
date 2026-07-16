import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALLOWED_PROFILE_AVATARS,
  createProfileCollection,
  deleteProfileFromCollection,
  sanitizeProfiles,
  updateProfileCollection,
} from '../services/userProfileService.js';

test('profiles are sanitized and arbitrary avatar URLs are rejected', () => {
  assert.deepEqual(sanitizeProfiles([{ id: 'p1', name: '  An  ', avatarId: ALLOWED_PROFILE_AVATARS[0], secret: true }]), [
    { id: 'p1', name: 'An', avatarId: ALLOWED_PROFILE_AVATARS[0], isKids: false },
  ]);
  assert.throws(() => createProfileCollection([], { name: 'An', avatarId: 'https://evil.example/avatar.png' }), /avatar/i);
});

test('profile collection enforces maximum five and preserves unrelated metadata through controller merge contract', () => {
  const existing = Array.from({ length: 5 }, (_, index) => ({
    id: `p${index}`,
    name: `Profile ${index}`,
    avatarId: ALLOWED_PROFILE_AVATARS[index % ALLOWED_PROFILE_AVATARS.length],
  }));
  assert.throws(() => createProfileCollection(existing, { name: 'Sixth', avatarId: ALLOWED_PROFILE_AVATARS[0] }), /five/i);

  const updated = updateProfileCollection(existing, 'p0', { name: 'Renamed' });
  assert.equal(updated[0].name, 'Renamed');
  assert.equal(updated.length, 5);
});

test('final profile cannot be deleted', () => {
  assert.throws(() => deleteProfileFromCollection([
    { id: 'only', name: 'Only', avatarId: ALLOWED_PROFILE_AVATARS[0] },
  ], 'only'), /final/i);
});
