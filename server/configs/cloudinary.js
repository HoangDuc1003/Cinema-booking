import { v2 as cloudinary } from 'cloudinary';

export const getCloudinaryConfigStatus = (env = process.env) => {
    const cloudName = Boolean(env.CLOUDINARY_NAME?.trim());
    const apiKey = Boolean(env.CLOUDINARY_API_KEY?.trim());
    const apiSecret = Boolean(env.CLOUDINARY_SECRET_KEY?.trim());
    return Object.freeze({
        configured: cloudName && apiKey && apiSecret,
        variables: Object.freeze({ cloudName, apiKey, apiSecret }),
    });
};

export const connectCloudinary = (env = process.env) => {
    const status = getCloudinaryConfigStatus(env);
    if (!status.configured) {
        console.warn('[Cloudinary] Not configured');
        return status;
    }
    try {
        cloudinary.config({
            cloud_name: env.CLOUDINARY_NAME,
            api_key: env.CLOUDINARY_API_KEY,
            api_secret: env.CLOUDINARY_SECRET_KEY,
        });
        console.log('[Cloudinary] Configured');
    } catch (error) {
        console.warn('[Cloudinary] Configuration failed:', error.message);
    }
    return status;
};

export { cloudinary };
