import React, { useRef, useState } from 'react';
import { UploadCloudIcon, Trash2Icon, FileVideoIcon, Link2Icon, Loader2Icon } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../lib/apiClient';

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 180;
const MIN_VIDEO_WIDTH = 640;
const MIN_VIDEO_HEIGHT = 360;

const getHeroUploadErrorMessage = (error) => {
  const data = error?.response?.data;
  if (data?.code === 'HERO_VIDEO_CODEC_INVALID') {
    const videoCodec = data.details?.videoCodec || 'unknown';
    const audioCodec = data.details?.audioCodec || 'unknown';
    return `${data.message || 'Hero video codec is not compatible.'} Detected ${videoCodec}/${audioCodec}; retry the upload or use MP4 H.264 + AAC.`;
  }
  return data?.message || error?.message || 'Upload failed.';
};
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);

const inspectVideoFile = (file) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  let timeoutId;
  const cleanup = () => {
    window.clearTimeout(timeoutId);
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  };
  const finish = (callback, value) => {
    cleanup();
    callback(value);
  };
  video.preload = 'metadata';
  video.muted = true;
  video.onloadedmetadata = () => finish(resolve, {
    duration: Number(video.duration),
    width: Number(video.videoWidth),
    height: Number(video.videoHeight),
  });
  video.onerror = () => finish(reject, new Error('The selected video cannot be decoded.'));
  timeoutId = window.setTimeout(
    () => finish(reject, new Error('Timed out while reading video metadata.')),
    10_000,
  );
  video.src = objectUrl;
});

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const resolveHeroVideoReadiness = (movie = {}) => {
  const mediaStatus = normalizeStatus(movie.media?.status);
  const heroVideoStatus = normalizeStatus(movie.heroVideoStatus);
  const sourceStatus = normalizeStatus(movie.media?.sourceStatus);
  const verificationStatus = normalizeStatus(movie.media?.verificationStatus);
  const nativeValidationProvided = typeof movie.nativeVideoValid === 'boolean';
  const ready = nativeValidationProvided
    ? movie.nativeVideoValid
    : heroVideoStatus === 'ready' || mediaStatus === 'ready';

  if (ready) return { ready: true, status: 'ready', label: 'Verified native trailer' };

  const issues = Array.isArray(movie.nativeVideoIssues)
    ? movie.nativeVideoIssues.filter(Boolean).join(', ')
    : '';
  if (mediaStatus === 'failed' || heroVideoStatus === 'failed' || sourceStatus === 'rejected' || verificationStatus === 'failed') {
    const detail = movie.media?.failureCode || issues;
    return { ready: false, status: 'failed', label: detail ? `Failed: ${detail}` : 'Failed' };
  }
  if (mediaStatus === 'processing' || heroVideoStatus === 'processing' || verificationStatus === 'processing') {
    return { ready: false, status: 'processing', label: 'Processing native trailer' };
  }
  if (mediaStatus === 'ingesting' || heroVideoStatus === 'ingesting') {
    return { ready: false, status: 'ingesting', label: 'Ingesting native trailer' };
  }
  if (mediaStatus === 'pending' || heroVideoStatus === 'pending' || sourceStatus === 'ready_for_ingestion') {
    return { ready: false, status: 'pending', label: 'Pending ingestion' };
  }
  if (mediaStatus === 'retired') {
    return { ready: false, status: 'retired', label: 'Retired media asset' };
  }
  if (nativeValidationProvided) {
    return {
      ready: false,
      status: 'invalid',
      label: issues || 'Native trailer failed verification',
    };
  }
  if (sourceStatus === 'needs_authorized_source') {
    return { ready: false, status: 'missing', label: 'Authorized source required' };
  }
  return { ready: false, status: 'missing', label: issues || 'Trailer missing' };
};

const READINESS_TONES = Object.freeze({
  ready: 'text-green-400',
  pending: 'text-blue-300',
  ingesting: 'text-blue-300',
  processing: 'text-blue-300',
  failed: 'text-red-300',
  invalid: 'text-amber-300',
  retired: 'text-amber-300',
  missing: 'text-amber-300',
});

export const HeroVideoReadiness = ({ movie, className = '' }) => {
  const readiness = resolveHeroVideoReadiness(movie);
  return (
    <span
      data-hero-media-status={readiness.status}
      className={`inline-flex items-center gap-1 ${READINESS_TONES[readiness.status]} ${className}`.trim()}
    >
      {readiness.ready && <FileVideoIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      {readiness.label}
    </span>
  );
};

const HeroVideoUploader = ({ movie, onUpdated }) => {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const videoMetadata = movie.heroVideoMetadata || {};
  const videoDuration = Number(videoMetadata.duration ?? movie.heroVideoDuration);
  const videoWidth = Number(videoMetadata.width ?? movie.heroVideoWidth);
  const videoHeight = Number(videoMetadata.height ?? movie.heroVideoHeight);
  const [progress, setProgress] = useState(0);
  const mediaReadiness = resolveHeroVideoReadiness(movie);
  const isVerifiedReady = mediaReadiness.ready;
  const movieId = movie._id || movie.id;
  const [sourceUrl, setSourceUrl] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [queueingSource, setQueueingSource] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showReplacement, setShowReplacement] = useState(!isVerifiedReady);

  const handleSourceSubmit = async (event) => {
    event.preventDefault();
    if (!rightsConfirmed) {
      toast.error('Confirm authorization before queueing this source.');
      return;
    }
    try {
      setQueueingSource(true);
      const { data } = await apiClient.post(`/api/admin/hero/${movieId}/source`, {
        sourceType: 'AUTHORIZED_REMOTE_URL',
        sourceProvider: 'admin-approved',
        sourceUrl,
        rightsStatus: 'AUTHORIZED',
        rightsConfirmed: true,
        provenance: { submittedVia: 'hero-admin' },
      });
      if (!data.success) throw new Error(data.message || 'Unable to queue the source.');
      toast.success(data.reused ? 'Verified media is already in the library.' : 'Authorized source queued for Cloudinary ingestion.');
      setSourceUrl('');
      setRightsConfirmed(false);
      setShowReplacement(false);
      onUpdated?.();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to queue the source.');
    } finally {
      setQueueingSource(false);
    }
  };

  const handleRetry = async () => {
    const assetId = movie.media?.id;
    if (!assetId) return;
    try {
      setRetrying(true);
      const { data } = await apiClient.post(`/api/admin/hero/media/${assetId}/retry`);
      if (!data.success) throw new Error(data.message || 'Unable to retry ingestion.');
      toast.success('Hero media ingestion was queued again.');
      onUpdated?.();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to retry ingestion.');
    } finally {
      setRetrying(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
      toast.error('Choose an MP4 or WebM video.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error('Video size must be 100 MB or less.');
      return;
    }

    try {
      setUploading(true);
      setProgress(0);
      const metadata = await inspectVideoFile(file);
      if (
        !Number.isFinite(metadata.duration)
        || metadata.duration <= 0
        || metadata.duration > MAX_VIDEO_DURATION_SECONDS
        || metadata.width < MIN_VIDEO_WIDTH
        || metadata.height < MIN_VIDEO_HEIGHT
      ) {
        throw new Error('Video must be decodable, at most 180 seconds, and at least 640×360.');
      }

      const { data: sigData } = await apiClient.get(`/api/admin/hero/upload-signature?movieId=${movieId}`);
      if (!sigData.success) throw new Error(sigData.message || 'Failed to get upload signature');

      const {
        timestamp,
        signature,
        cloudName,
        apiKey,
        folder,
        context,
      } = sigData.signatureData;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      formData.append('folder', folder);
      if (context) formData.append('context', context);
      if (sigData.signatureData.transformation) {
        formData.append('transformation', sigData.signatureData.transformation);
      }

      const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
      
      const xhr = new XMLHttpRequest();
      await new Promise((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded * 100) / e.total));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error('Cloudinary upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Cloudinary upload error'));
        xhr.open('POST', cloudinaryUrl, true);
        xhr.send(formData);
      }).then(async (cloudinaryRes) => {
        const { data: commitData } = await apiClient.post(`/api/admin/hero/${movieId}/commit`, {
          publicId: cloudinaryRes.public_id,
        });
        if (!commitData.success) throw new Error(commitData.message);
        toast.success(commitData.activation?.status === 'active'
          ? 'Trailer verified and a Hero batch was activated.'
          : 'Trailer verified. Hero activation remains pending until 15 eligible trailers exist.');
        onUpdated?.();
      });

    } catch (error) {
      toast.error(getHeroUploadErrorMessage(error));
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Are you sure you want to remove the native video?')) return;
    try {
      setUploading(true);
      const { data } = await apiClient.delete(`/api/admin/hero/${movieId}/video`);
      if (data.success) {
        toast.success('Video removed.');
        onUpdated?.();
      } else {
        toast.error(data.message || 'Failed to remove video.');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to remove video.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-2 text-sm">
      {isVerifiedReady ? (
        <div className="flex flex-wrap items-center gap-3">
          <HeroVideoReadiness movie={movie} />
          {videoDuration > 0 && (
            <span className="text-xs text-gray-500">
              {Math.round(videoDuration)}s
              {videoWidth > 0 && videoHeight > 0
                ? ` · ${videoWidth}×${videoHeight}`
                : ''}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowReplacement((value) => !value)}
            className="flex items-center gap-1 text-blue-300 hover:text-blue-200"
          >
            <Link2Icon className="w-3 h-3" />
            Replace asset
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading}
            className="flex items-center gap-1 text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            <Trash2Icon className="w-3 h-3" />
            Remove
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <HeroVideoReadiness movie={movie} className="text-xs" />
          {!showReplacement && (
            <button
              type="button"
              onClick={() => setShowReplacement(true)}
              className="text-[11px] text-blue-300 hover:text-blue-200"
            >
              Provide source
            </button>
          )}
          {mediaReadiness.status === 'failed' && movie.media?.id && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="rounded border border-amber-400/30 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
            >
              {retrying ? 'Retrying' : 'Retry ingestion'}
            </button>
          )}
        </div>
      )}
      {showReplacement && (
        <form onSubmit={handleSourceSubmit} className="mt-3 space-y-2 rounded border border-blue-500/30 bg-blue-500/5 p-2">
          <label className="block text-xs text-gray-300">
            Authorized direct media URL
            <input
              type="url"
              required
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://licensed-cdn.example/trailer.mp4"
              className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus:border-primary"
            />
          </label>
          <label className="flex items-start gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              onChange={(event) => setRightsConfirmed(event.target.checked)}
              className="mt-0.5 rounded border-white/20 bg-black/30 text-primary"
            />
            <span>I confirm NitroCine is authorized to ingest and rehost this asset.</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={queueingSource}
              className="flex items-center gap-1.5 rounded bg-primary px-2.5 py-1.5 text-xs text-white disabled:opacity-60"
            >
              {queueingSource ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <Link2Icon className="h-3.5 w-3.5" />}
              {queueingSource ? 'Queueing' : 'Queue authorized source'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded bg-white/10 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/20 disabled:opacity-50"
            >
              {uploading ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <UploadCloudIcon className="h-3.5 w-3.5" />}
              {uploading ? `Uploading ${progress}%` : 'Upload manually'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm"
            className="hidden"
            onChange={handleFileChange}
          />
        </form>
      )}
    </div>
  );
};

export default HeroVideoUploader;
