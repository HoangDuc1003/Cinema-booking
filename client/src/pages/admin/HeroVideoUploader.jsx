import React, { useRef, useState } from 'react';
import { UploadCloudIcon, Trash2Icon, FileVideoIcon, Loader2Icon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 180;
const MIN_VIDEO_WIDTH = 640;
const MIN_VIDEO_HEIGHT = 360;
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

const HeroVideoUploader = ({ movie, onUpdated }) => {
  const { axios } = useAppContext();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const videoMetadata = movie.heroVideoMetadata || {};
  const videoDuration = Number(videoMetadata.duration ?? movie.heroVideoDuration);
  const videoWidth = Number(videoMetadata.width ?? movie.heroVideoWidth);
  const videoHeight = Number(videoMetadata.height ?? movie.heroVideoHeight);
  const [progress, setProgress] = useState(0);
  const isVerifiedReady = movie.nativeVideoValid === true;

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

      const { data: sigData } = await axios.get(`/api/admin/hero/upload-signature?movieId=${movie._id || movie.id}`);
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
        const { data: commitData } = await axios.post(`/api/admin/hero/${movie._id || movie.id}/commit`, {
          publicId: cloudinaryRes.public_id,
        });
        if (!commitData.success) throw new Error(commitData.message);
        toast.success(commitData.activation?.status === 'active'
          ? 'Trailer verified and a Hero batch was activated.'
          : 'Trailer verified. Hero activation remains pending until 15 eligible trailers exist.');
        onUpdated?.();
      });

    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Upload failed.');
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
      const { data } = await axios.delete(`/api/admin/hero/${movie._id || movie.id}/video`);
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
    <div className="mt-2 text-sm flex flex-wrap items-center gap-3">
      {isVerifiedReady ? (
        <>
          <div className="flex items-center gap-1 text-green-400">
             <FileVideoIcon className="w-4 h-4" />
             Ready
          </div>
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
            onClick={handleRemove}
            disabled={uploading}
            className="flex items-center gap-1 text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            <Trash2Icon className="w-3 h-3" />
            Remove
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-gray-300 disabled:opacity-50"
          >
            {uploading ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <UploadCloudIcon className="w-4 h-4" />}
            {uploading ? `Uploading ${progress}%` : 'Upload Video'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm"
            className="hidden"
            onChange={handleFileChange}
          />
        </>
      )}
    </div>
  );
};

export default HeroVideoUploader;
