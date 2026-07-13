export const LETTERBOX_CLASSIFICATIONS = Object.freeze({
  CLEAN: 'clean',
  CROPPED: 'cropped',
  UNRELIABLE: 'unreliable',
});

export const LETTERBOX_REASONS = Object.freeze({
  OK: 'ok',
  INSUFFICIENT_FRAMES: 'insufficient-frames',
  DIMENSION_MISMATCH: 'dimension-mismatch',
  CROP_CAP_EXCEEDED: 'crop-cap-exceeded',
  UNSTABLE_CROP: 'unstable-crop',
  LOW_CONFIDENCE: 'low-confidence',
  INVALID_GEOMETRY: 'invalid-geometry',
});

export const DEFAULT_LETTERBOX_OPTIONS = Object.freeze({
  luminanceThreshold: 18,
  standardDeviationThreshold: 8,
  darkPixelRatio: 0.9,
  minimumFrames: 12,
  stableFrameRatio: 0.75,
  minimumConfidence: 0.85,
  consensusTolerancePixels: 1,
  maxVerticalCropRatio: 0.15,
  maxHorizontalCropRatio: 0.1,
});

const EDGES = Object.freeze(['top', 'right', 'bottom', 'left']);
const EMPTY_CROP = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

const roundConfidence = (value) => Math.round(value * 1_000_000) / 1_000_000;

const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
};

const resolveOptions = (options = {}) => ({
  ...DEFAULT_LETTERBOX_OPTIONS,
  ...options,
});

const assertFrameDimensions = (frame) => {
  if (!Number.isInteger(frame?.width) || frame.width <= 0) {
    throw new TypeError('Letterbox frames require a positive integer width.');
  }

  if (!Number.isInteger(frame?.height) || frame.height <= 0) {
    throw new TypeError('Letterbox frames require a positive integer height.');
  }
};

const createLuminanceReader = (frame) => {
  assertFrameDimensions(frame);

  const pixelCount = frame.width * frame.height;
  if (frame.luminance?.length >= pixelCount) {
    return (index) => Number(frame.luminance[index]);
  }

  const channels = frame.data?.length / pixelCount;
  if (channels !== 3 && channels !== 4) {
    throw new TypeError('Letterbox frames require luminance values or RGB/RGBA pixel data.');
  }

  return (index) => {
    const offset = index * channels;
    const red = Number(frame.data[offset]);
    const green = Number(frame.data[offset + 1]);
    const blue = Number(frame.data[offset + 2]);
    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  };
};

const analyzeSamples = (sampleCount, readSample, options) => {
  let sum = 0;
  let squareSum = 0;
  let darkPixels = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const luminance = readSample(index);
    sum += luminance;
    squareSum += luminance * luminance;
    if (luminance <= options.luminanceThreshold) darkPixels += 1;
  }

  const mean = sum / sampleCount;
  const variance = Math.max(0, (squareSum / sampleCount) - (mean * mean));
  const standardDeviation = Math.sqrt(variance);
  const darkRatio = darkPixels / sampleCount;

  return {
    mean,
    standardDeviation,
    darkRatio,
    isBar: (
      mean <= options.luminanceThreshold
      && standardDeviation <= options.standardDeviationThreshold
      && darkRatio >= options.darkPixelRatio
    ),
  };
};

const analyzeRow = ({ row, width, readLuminance, options }) => analyzeSamples(
  width,
  (column) => readLuminance((row * width) + column),
  options,
);

const analyzeColumn = ({
  column,
  width,
  rowStart,
  rowEnd,
  readLuminance,
  options,
}) => analyzeSamples(
  rowEnd - rowStart,
  (rowOffset) => readLuminance(((rowStart + rowOffset) * width) + column),
  options,
);

const scanEdge = ({ lineCount, maximumCrop, analyzeLine, fromEnd = false }) => {
  let crop = 0;

  for (let offset = 0; offset < maximumCrop; offset += 1) {
    const line = fromEnd ? lineCount - 1 - offset : offset;
    if (!analyzeLine(line).isBar) {
      return {
        crop,
        valid: true,
        capExceeded: false,
      };
    }
    crop += 1;
  }

  const boundaryLine = fromEnd
    ? lineCount - 1 - maximumCrop
    : maximumCrop;
  const hasBoundaryLine = boundaryLine >= 0 && boundaryLine < lineCount;
  const capExceeded = !hasBoundaryLine || analyzeLine(boundaryLine).isBar;

  return {
    crop,
    valid: !capExceeded,
    capExceeded,
  };
};

/**
 * Inspects one down-sampled frame without depending on Canvas or any browser API.
 * A frame may contain either `{ width, height, luminance }` (one value per pixel)
 * or `{ width, height, data }` containing packed RGB/RGBA values.
 */
export const analyzeLetterboxFrame = (frame, customOptions = {}) => {
  const options = resolveOptions(customOptions);
  const { width, height } = frame;
  const readLuminance = createLuminanceReader(frame);
  const maximumVerticalCrop = Math.floor(height * options.maxVerticalCropRatio);
  const maximumHorizontalCrop = Math.floor(width * options.maxHorizontalCropRatio);

  const top = scanEdge({
    lineCount: height,
    maximumCrop: maximumVerticalCrop,
    analyzeLine: (row) => analyzeRow({ row, width, readLuminance, options }),
  });
  const bottom = scanEdge({
    lineCount: height,
    maximumCrop: maximumVerticalCrop,
    analyzeLine: (row) => analyzeRow({ row, width, readLuminance, options }),
    fromEnd: true,
  });

  const rowStart = top.valid ? top.crop : 0;
  const rowEnd = bottom.valid ? height - bottom.crop : height;
  const analyzeVerticalLine = (column) => analyzeColumn({
    column,
    width,
    rowStart,
    rowEnd,
    readLuminance,
    options,
  });
  const left = scanEdge({
    lineCount: width,
    maximumCrop: maximumHorizontalCrop,
    analyzeLine: analyzeVerticalLine,
  });
  const right = scanEdge({
    lineCount: width,
    maximumCrop: maximumHorizontalCrop,
    analyzeLine: analyzeVerticalLine,
    fromEnd: true,
  });

  const edges = { top, right, bottom, left };
  const crop = Object.fromEntries(EDGES.map((edge) => [edge, edges[edge].crop]));
  const cappedEdges = EDGES.filter((edge) => edges[edge].capExceeded);

  return {
    width,
    height,
    valid: cappedEdges.length === 0,
    crop,
    cappedEdges,
    edges,
  };
};

const createEdgeConsensus = ({ analyses, edge, options }) => {
  const validAnalyses = analyses.filter((analysis) => analysis.edges[edge].valid);
  const values = validAnalyses.map((analysis) => analysis.crop[edge]);
  const crop = Math.round(median(values));
  const stableCount = values.filter(
    (value) => Math.abs(value - crop) <= options.consensusTolerancePixels,
  ).length;
  const validCount = values.length;
  const sampleCount = analyses.length;
  const stability = sampleCount === 0 ? 0 : stableCount / sampleCount;
  const validRatio = sampleCount === 0 ? 0 : validCount / sampleCount;
  const confidence = (stability + validRatio) / 2;

  return {
    crop,
    stableCount,
    validCount,
    capExceededCount: sampleCount - validCount,
    stability: roundConfidence(stability),
    confidence: roundConfidence(confidence),
  };
};

const cropToRatios = (crop, width, height) => ({
  top: height > 0 ? crop.top / height : 0,
  right: width > 0 ? crop.right / width : 0,
  bottom: height > 0 ? crop.bottom / height : 0,
  left: width > 0 ? crop.left / width : 0,
});

const createUnreliableResult = ({
  reason,
  sampleCount,
  width = null,
  height = null,
  confidence = 0,
  crop = EMPTY_CROP,
  edgeConsensus = {},
}) => ({
  safeToDisplay: false,
  accepted: false,
  classification: LETTERBOX_CLASSIFICATIONS.UNRELIABLE,
  reason,
  confidence: roundConfidence(confidence),
  sampleCount,
  width,
  height,
  crop: { ...crop },
  cropRatios: cropToRatios(crop, width ?? 0, height ?? 0),
  sourceRect: null,
  edgeConsensus,
});

/**
 * Aggregates frame analyses into one stable crop decision.
 *
 * Exact return shape:
 * `{ safeToDisplay, accepted, classification, reason, confidence, sampleCount,
 *    width, height, crop, cropRatios, sourceRect, edgeConsensus }`.
 * `safeToDisplay` is true both for confidently clean video and for an accepted
 * stable crop. It is false for insufficient, capped, unstable, or invalid input.
 */
export const detectStableLetterbox = (frames, customOptions = {}) => {
  const options = resolveOptions(customOptions);
  const sampleCount = Array.isArray(frames) ? frames.length : 0;

  if (sampleCount === 0) {
    return createUnreliableResult({
      reason: LETTERBOX_REASONS.INSUFFICIENT_FRAMES,
      sampleCount,
    });
  }

  const analyses = frames.map((frame) => analyzeLetterboxFrame(frame, options));
  const [{ width, height }] = analyses;
  const dimensionsMatch = analyses.every(
    (analysis) => analysis.width === width && analysis.height === height,
  );

  if (!dimensionsMatch) {
    return createUnreliableResult({
      reason: LETTERBOX_REASONS.DIMENSION_MISMATCH,
      sampleCount,
      width,
      height,
    });
  }

  const edgeConsensus = Object.fromEntries(EDGES.map((edge) => [
    edge,
    createEdgeConsensus({ analyses, edge, options }),
  ]));
  const crop = Object.fromEntries(EDGES.map((edge) => [edge, edgeConsensus[edge].crop]));
  const confidence = Math.min(...EDGES.map((edge) => edgeConsensus[edge].confidence));
  const sourceWidth = width - crop.left - crop.right;
  const sourceHeight = height - crop.top - crop.bottom;
  const geometryIsValid = sourceWidth > 0 && sourceHeight > 0;

  if (sampleCount < options.minimumFrames) {
    return createUnreliableResult({
      reason: LETTERBOX_REASONS.INSUFFICIENT_FRAMES,
      sampleCount,
      width,
      height,
      confidence,
      crop,
      edgeConsensus,
    });
  }

  const maximumUnstableFrames = sampleCount * (1 - options.stableFrameRatio);
  const cropCapExceeded = EDGES.some(
    (edge) => edgeConsensus[edge].capExceededCount > maximumUnstableFrames,
  );
  if (cropCapExceeded) {
    return createUnreliableResult({
      reason: LETTERBOX_REASONS.CROP_CAP_EXCEEDED,
      sampleCount,
      width,
      height,
      confidence,
      crop,
      edgeConsensus,
    });
  }

  const stable = EDGES.every(
    (edge) => edgeConsensus[edge].stability >= options.stableFrameRatio,
  );
  if (!stable) {
    return createUnreliableResult({
      reason: LETTERBOX_REASONS.UNSTABLE_CROP,
      sampleCount,
      width,
      height,
      confidence,
      crop,
      edgeConsensus,
    });
  }

  if (confidence < options.minimumConfidence) {
    return createUnreliableResult({
      reason: LETTERBOX_REASONS.LOW_CONFIDENCE,
      sampleCount,
      width,
      height,
      confidence,
      crop,
      edgeConsensus,
    });
  }

  if (!geometryIsValid) {
    return createUnreliableResult({
      reason: LETTERBOX_REASONS.INVALID_GEOMETRY,
      sampleCount,
      width,
      height,
      confidence,
      crop,
      edgeConsensus,
    });
  }

  const hasLetterbox = EDGES.some((edge) => crop[edge] > 0);

  return {
    safeToDisplay: true,
    accepted: true,
    classification: hasLetterbox
      ? LETTERBOX_CLASSIFICATIONS.CROPPED
      : LETTERBOX_CLASSIFICATIONS.CLEAN,
    reason: LETTERBOX_REASONS.OK,
    confidence: roundConfidence(confidence),
    sampleCount,
    width,
    height,
    crop,
    cropRatios: cropToRatios(crop, width, height),
    sourceRect: {
      x: crop.left,
      y: crop.top,
      width: sourceWidth,
      height: sourceHeight,
    },
    edgeConsensus,
  };
};

const requirePositiveDimension = (value, name) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
};

/**
 * Returns the absolute layout for an intrinsic-size video. Apply `width`,
 * `height`, `left`, and `top` to an absolutely positioned element. The crop's
 * visible rectangle will cover and remain centered inside the container.
 */
export const calculateCoverTransform = ({
  containerWidth,
  containerHeight,
  videoWidth,
  videoHeight,
  crop = EMPTY_CROP,
}) => {
  requirePositiveDimension(containerWidth, 'containerWidth');
  requirePositiveDimension(containerHeight, 'containerHeight');
  requirePositiveDimension(videoWidth, 'videoWidth');
  requirePositiveDimension(videoHeight, 'videoHeight');

  const normalizedCrop = Object.fromEntries(EDGES.map((edge) => {
    const value = crop?.[edge] ?? 0;
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`crop.${edge} must be a non-negative finite number.`);
    }
    return [edge, value];
  }));
  const visibleVideoWidth = videoWidth - normalizedCrop.left - normalizedCrop.right;
  const visibleVideoHeight = videoHeight - normalizedCrop.top - normalizedCrop.bottom;
  requirePositiveDimension(visibleVideoWidth, 'cropped video width');
  requirePositiveDimension(visibleVideoHeight, 'cropped video height');

  const scale = Math.max(
    containerWidth / visibleVideoWidth,
    containerHeight / visibleVideoHeight,
  );
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  const visibleWidth = visibleVideoWidth * scale;
  const visibleHeight = visibleVideoHeight * scale;
  const left = ((containerWidth - visibleWidth) / 2) - (normalizedCrop.left * scale);
  const top = ((containerHeight - visibleHeight) / 2) - (normalizedCrop.top * scale);

  return {
    width,
    height,
    left,
    top,
    scale,
  };
};
