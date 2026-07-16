import assert from 'node:assert/strict';
import test from 'node:test';
import { createUserProfileHandlers } from '../controllers/userController.js';

const response = () => {
  const state = { status: 200, body: null };
  return {
    state,
    status(code) { state.status = code; return this; },
    json(body) { state.body = body; return this; },
  };
};

test('profile controller rejects requests without an authenticated Clerk user', async () => {
  const { getProfiles } = createUserProfileHandlers({ users: {} });
  const res = response();
  await getProfiles({ auth: () => ({ userId: null }) }, res);
  assert.equal(res.state.status, 401);
  assert.equal(res.state.body.success, false);
});

test('profile writes use authenticated identity and preserve favorites and unrelated private metadata', async () => {
  const calls = { getUserId: '', updateUserId: '', metadata: null };
  const { createProfile } = createUserProfileHandlers({
    users: {
      getUser: async (userId) => {
        calls.getUserId = userId;
        return {
          fullName: 'Nitro User',
          privateMetadata: { favorites: ['historical-movie'], role: 'member', unrelated: { safe: true } },
        };
      },
      updateUserMetadata: async (userId, input) => {
        calls.updateUserId = userId;
        calls.metadata = input.privateMetadata;
      },
    },
  });

  const res = response();
  await createProfile({
    auth: () => ({ userId: 'authenticated-user' }),
    body: { name: 'An', avatarId: 'nitro-blue' },
    params: { userId: 'attacker-controlled-user' },
  }, res);

  assert.equal(res.state.status, 201);
  assert.equal(calls.getUserId, 'authenticated-user');
  assert.equal(calls.updateUserId, 'authenticated-user');
  assert.deepEqual(calls.metadata.favorites, ['historical-movie']);
  assert.equal(calls.metadata.role, 'member');
  assert.deepEqual(calls.metadata.unrelated, { safe: true });
  assert.equal(calls.metadata.nitrocineProfiles.length, 1);
  assert.deepEqual(Object.keys(res.state.body.profile).sort(), ['avatarId', 'id', 'isKids', 'name']);
});
