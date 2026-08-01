import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/components/CinematicTrailerPlayer.jsx', import.meta.url), 'utf8');

test('non-Hero trailer speaker exposes an accessible volume range control', () => {
  assert.match(source, /className="cinematic-volume-control"/);
  assert.match(source, /className="cinematic-volume-popover" role="group" aria-label="Trailer volume controls"/);
  assert.match(source, /type="range"[\s\S]*aria-label="Trailer volume"/);
  assert.match(source, /onChange=\{handleVolumeChange\}/);
});
