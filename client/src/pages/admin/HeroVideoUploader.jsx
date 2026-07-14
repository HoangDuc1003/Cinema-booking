import React, { useRef, useState } from 'react';
import { UploadCloudIcon, Trash2Icon, FileVideoIcon, Loader2Icon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';

const HeroVideoUploader = ({ movie, onUpdated }) => {
  const { axios } = useAppContext();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error('Please select a valid video file.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Video size must be less than 50MB.');
      return;
    }

    try {
      setUploading(true);
      setProgress(0);

      const { data: sigData } = await axios.get(`/api/admin/hero/upload-signature?movieId=${movie._id || movie.id}`);
      if (!sigData.success) throw new Error(sigData.message || 'Failed to get upload signature');

      const { timestamp, signature, cloudName, apiKey, folder } = sigData.signatureData;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      formData.append('folder', folder);

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
            url: cloudinaryRes.secure_url,
            mimeType: file.type
        });
        if (!commitData.success) throw new Error(commitData.message);
        toast.success('Video uploaded and committed successfully.');
        onUpdated?.();
      });

    } catch (error) {
        toast.error(error.message || 'Upload failed.');
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
      toast.error(error.message || 'Failed to remove video.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-2 text-sm flex items-center gap-3">
      {movie.heroVideoStatus === 'ready' ? (
        <>
          <div className="flex items-center gap-1 text-green-400">
             <FileVideoIcon className="w-4 h-4" />
             Ready
          </div>
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
