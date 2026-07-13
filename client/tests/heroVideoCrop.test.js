import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LETTERBOX_CLASSIFICATIONS,
  LETTERBOX_REASONS,
  analyzeLetterboxFrame,
  calculateCoverTransform,
  detectStableLetterbox,
} from '../src/components/hero/heroVideoCrop.js';

const makeFrame = ({
  width = 80,
  height = 60,
  top = 0,
  right = 0,
  bottom = 0,
  left = 0,
  barLuminance = 2,
} = {}) => {
  const luminance = new Float32Array(width * height);

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const isBar = (
        row < top
        || row >= height - bottom
        || column < left
        || column >= width - right
      );
      luminance[(row * width) + column] = isBar
        ? barLuminance
        : 96 + ((row + column) % 7) * 12;
    }
  }

  return { width, height, luminance };
};

test('a single frame detects dark uniform rows and columns from every edge', () => {
  const analysis = analyzeLetterboxFrame(makeFrame({
    top: 6,
    right: 4,
    bottom: 5,
    left: 3,
  }));

  assert.equal(analysis.valid, true);
  assert.deepEqual(analysis.crop, {
    top: 6,
    right: 4,
    bottom: 5,
    left: 3,
  });
  assert.deepEqual(analysis.cappedEdges, []);
});

test('twelve clean frames are explicitly safe to display without a crop', () => {
  const result = detectStableLetterbox(
    Array.from({ length: 12 }, () => makeFrame()),
  );

  assert.equal(result.safeToDisplay, true);
  assert.equal(result.accepted, true);
  assert.equal(result.classification, LETTERBOX_CLASSIFICATIONS.CLEAN);
  assert.equal(result.reason, LETTERBOX_REASONS.OK);
  assert.equal(result.confidence, 1);
  assert.deepEqual(result.crop, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.deepEqual(result.sourceRect, { x: 0, y: 0, width: 80, height: 60 });
});

test('stable multi-frame letterbox measurements produce one accepted crop', () => {
  const frames = Array.from({ length: 12 }, (_, index) => makeFrame({
    top: 6 + (index % 3) - 1,
    right: 4,
    bottom: 6,
    left: 4,
  }));
  const result = detectStableLetterbox(frames);

  assert.equal(result.safeToDisplay, true);
  assert.equal(result.classification, LETTERBOX_CLASSIFICATIONS.CROPPED);
  assert.equal(result.confidence, 1);
  assert.deepEqual(result.crop, { top: 6, right: 4, bottom: 6, left: 4 });
  assert.deepEqual(result.cropRatios, {
    top: 0.1,
    right: 0.05,
    bottom: 0.1,
    left: 0.05,
  });
  assert.deepEqual(result.sourceRect, { x: 4, y: 6, width: 72, height: 48 });
});

test('nine matching frames out of twelve pass stable aggregation at high confidence', () => {
  const stableFrames = Array.from({ length: 9 }, () => makeFrame({ top: 6, bottom: 6 }));
  const outliers = Array.from({ length: 3 }, () => makeFrame({ top: 2, bottom: 2 }));
  const result = detectStableLetterbox([...stableFrames, ...outliers]);

  assert.equal(result.safeToDisplay, true);
  assert.equal(result.confidence, 0.875);
  assert.equal(result.edgeConsensus.top.stableCount, 9);
  assert.equal(result.edgeConsensus.bottom.stableCount, 9);
  assert.deepEqual(result.crop, { top: 6, right: 0, bottom: 6, left: 0 });
});

test('unstable edge measurements remain hidden behind the poster', () => {
  const topCrops = [0, 0, 0, 3, 3, 3, 6, 6, 6, 8, 8, 8];
  const result = detectStableLetterbox(topCrops.map((top) => makeFrame({ top })));

  assert.equal(result.safeToDisplay, false);
  assert.equal(result.classification, LETTERBOX_CLASSIFICATIONS.UNRELIABLE);
  assert.equal(result.reason, LETTERBOX_REASONS.UNSTABLE_CROP);
  assert.ok(result.edgeConsensus.top.stability < 0.75);
});

test('bars extending beyond crop caps are rejected instead of partially exposed', () => {
  const result = detectStableLetterbox(
    Array.from({ length: 12 }, () => makeFrame({ top: 12 })),
  );

  assert.equal(result.safeToDisplay, false);
  assert.equal(result.reason, LETTERBOX_REASONS.CROP_CAP_EXCEEDED);
  assert.equal(result.edgeConsensus.top.capExceededCount, 12);
});

test('a uniformly dark scene is treated as ambiguous rather than a giant letterbox', () => {
  const darkFrame = {
    width: 80,
    height: 60,
    luminance: new Float32Array(80 * 60).fill(4),
  };
  const result = detectStableLetterbox(Array.from({ length: 12 }, () => darkFrame));

  assert.equal(result.safeToDisplay, false);
  assert.equal(result.reason, LETTERBOX_REASONS.CROP_CAP_EXCEEDED);
});

test('packed RGBA input is supported without DOM ImageData', () => {
  const width = 8;
  const height = 8;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const row = Math.floor(index / width);
    const luminance = row === 0 ? 0 : 140;
    data[(index * 4)] = luminance;
    data[(index * 4) + 1] = luminance;
    data[(index * 4) + 2] = luminance;
    data[(index * 4) + 3] = 255;
  }

  const result = analyzeLetterboxFrame({ width, height, data }, {
    maxVerticalCropRatio: 0.25,
  });
  assert.equal(result.crop.top, 1);
  assert.equal(result.valid, true);
});

test('fewer than twelve samples never unlock the video', () => {
  const result = detectStableLetterbox(
    Array.from({ length: 11 }, () => makeFrame()),
  );

  assert.equal(result.safeToDisplay, false);
  assert.equal(result.reason, LETTERBOX_REASONS.INSUFFICIENT_FRAMES);
});

test('cover transform fills the container and centers the detected source rect', () => {
  const transform = calculateCoverTransform({
    containerWidth: 1_600,
    containerHeight: 900,
    videoWidth: 1_920,
    videoHeight: 1_080,
    crop: { top: 108, right: 0, bottom: 108, left: 0 },
  });

  assert.deepEqual(Object.keys(transform), ['width', 'height', 'left', 'top', 'scale']);
  assert.ok(Math.abs(transform.width - 2_000) < 1e-9);
  assert.ok(Math.abs(transform.height - 1_125) < 1e-9);
  assert.ok(Math.abs(transform.left - (-200)) < 1e-9);
  assert.ok(Math.abs(transform.top - (-112.5)) < 1e-9);
  assert.ok(Math.abs(transform.scale - 1.0416666666666667) < 1e-12);
});

test('cover transform rejects a crop that consumes the source', () => {
  assert.throws(() => calculateCoverTransform({
    containerWidth: 1_000,
    containerHeight: 600,
    videoWidth: 1_920,
    videoHeight: 1_080,
    crop: { top: 540, bottom: 540 },
  }), /cropped video height/);
});
