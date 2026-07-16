import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('phone App renders a dedicated mobile gate without mounting desktop navigation', () => {
  const app = read('App.jsx');
  assert.match(app, /useMediaQuery/);
  assert.match(app, /MobileExperienceGate/);
  assert.match(app, /isPhone\s*\?\s*<MobileExperienceGate/);
});

test('mobile experience implements auth, profile picker, launch, featured card, rails and bottom navigation', () => {
  const gate = read('components/mobile/MobileExperienceGate.jsx');
  assert.match(gate, /MobileAuthEntry/);
  assert.match(gate, /ProfilePicker/);
  assert.match(gate, /ProfileLaunchScreen/);
  assert.match(gate, /MobileHome/);

  const home = read('pages/MobileHome.jsx');
  assert.match(home, /MobileFeaturedCard/);
  assert.match(home, /MobileMovieRail/);
  assert.match(home, /MobileBottomNav/);
});

test('active profile storage is scoped to Clerk user and launch timing is data driven', () => {
  const profile = read('context/ProfileContext.jsx');
  assert.match(profile, /nitrocine:active-profile:/);
  assert.match(profile, /sessionStorage/);

  const launch = read('components/mobile/ProfileLaunchScreen.jsx');
  assert.match(launch, /criticalReady/);
  assert.doesNotMatch(launch, /8000/);
  assert.match(launch, /3000/);
});

test('legacy Loading route no longer performs a fixed eight second redirect', () => {
  const loading = read('components/Loading.jsx');
  assert.doesNotMatch(loading, /8000/);
  assert.doesNotMatch(loading, /nextUrl/);
});

