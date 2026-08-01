import { clerkClient } from '@clerk/express';

export const protectAdmin = async (req, res, next) => {
    try {
        const { userId } = req.auth?.() || {};
        if (!userId) {
            return res.status(401).json({ success: false, code: 'AUTHENTICATION_REQUIRED', message: 'Not authorized.' });
        }
        const user = await clerkClient.users.getUser(userId);
        if (user.privateMetadata?.role !== 'admin') {
            return res.status(403).json({ success: false, code: 'ADMIN_REQUIRED', message: 'Not authorized.' });
        }
        return next();
    } catch (error) {
        console.error(JSON.stringify({ event: 'admin-auth-failed', errorCode: error?.code || error?.name || 'AUTH_ERROR' }));
        return res.status(401).json({ success: false, code: 'AUTHENTICATION_REQUIRED', message: 'Not authorized.' });
    }
};
