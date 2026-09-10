import { randomUUID } from 'node:crypto';
import Booking from '../models/Booking.js';
import Show from '../models/Show.js';
import User from '../models/User.js';
import {
    getAdminHomeHero,
    randomizeHomeHero,
    updateHomeHero,
} from '../services/heroService.js';
import { inngest } from '../inngest/index.js';
import {
    failQueuedCatalogRefreshRun,
    getCatalogRefreshRun,
    queueCatalogRefreshRun,
} from '../services/catalogRefreshService.js';

export const isAdmin = async (_req, res) => {
    res.json({ success: true, isAdmin: true });
};

const ADMIN_LIST_LIMIT = 500;
const SHOW_MOVIE_SELECT = 'title poster_path vote_average runtime release_date';

const failAdminRequest = (res, event, error, message) => {
    // Admin responses must not carry internal failure details (server/AGENTS.md).
    console.error(JSON.stringify({ event, errorCode: error?.code || error?.name || 'UNKNOWN' }));
    return res.status(500).json({ success: false, message });
};

export const getDashboardData = async (_req, res) => {
    try {
        // Totals are aggregated in MongoDB; loading every paid booking only to
        // count and sum it grows unbounded with revenue.
        const [[totals], activeShows, totalUser] = await Promise.all([
            Booking.aggregate([
                { $match: { isPaid: true } },
                { $group: { _id: null, totalBookings: { $sum: 1 }, totalRevenue: { $sum: '$amount' } } },
            ]),
            Show.find({ showDateTime: { $gte: new Date() } })
                .populate({ path: 'movie', select: SHOW_MOVIE_SELECT })
                .sort({ showDateTime: 1 })
                .limit(ADMIN_LIST_LIMIT)
                .lean(),
            User.countDocuments(),
        ]);
        return res.json({
            success: true,
            dashboardData: {
                totalBookings: totals?.totalBookings || 0,
                totalRevenue: totals?.totalRevenue || 0,
                activeShows: activeShows.filter((show) => show.movie),
                totalUser,
            },
        });
    } catch (error) {
        return failAdminRequest(res, 'admin-dashboard-failed', error, 'Unable to load dashboard data.');
    }
};

export const getAllShows = async (_req, res) => {
    try {
        const shows = await Show.find({ showDateTime: { $gte: new Date() } })
            .populate({ path: 'movie', select: SHOW_MOVIE_SELECT })
            .sort({ showDateTime: 1 })
            .limit(ADMIN_LIST_LIMIT)
            .lean();
        return res.json({ success: true, shows: shows.filter((show) => show.movie) });
    } catch (error) {
        return failAdminRequest(res, 'admin-all-shows-failed', error, 'Unable to load shows.');
    }
};

export const getAllBookings = async (_req, res) => {
    try {
        const bookings = await Booking.find({})
            // Only the display name is needed; populating the whole user exposes email and avatar.
            .populate({ path: 'user', select: 'name' })
            .populate({
                path: 'show',
                select: 'showDateTime hall showPrice movie',
                populate: { path: 'movie', select: SHOW_MOVIE_SELECT },
            })
            .sort({ createdAt: -1 })
            .limit(ADMIN_LIST_LIMIT)
            .lean();
        // A booking whose show or movie was deleted would crash the admin table renderer.
        return res.json({
            success: true,
            bookings: bookings.filter((booking) => booking.user && booking.show?.movie),
        });
    } catch (error) {
        return failAdminRequest(res, 'admin-all-bookings-failed', error, 'Unable to load bookings.');
    }
};

export const getHeroSettings = async (_req, res) => {
    try {
        const hero = await getAdminHomeHero();
        return res.json({ success: true, hero });
    } catch (error) {
        const status = error.status || error.statusCode || 500;
        console.error(JSON.stringify({
            event: 'admin-hero-settings-failed',
            errorCode: error?.code || error?.name || 'UNKNOWN',
        }));
        return res.status(status).json({
            success: false,
            message: status < 500 ? error.message : 'Unable to load hero settings.',
        });
    }
};

const failHeroAction = (res, event, error, fallbackMessage) => {
    const status = error.status || error.statusCode || 500;
    console.error(JSON.stringify({ event, errorCode: error?.code || error?.name || 'UNKNOWN' }));
    return res.status(status).json({
        success: false,
        code: error.code || 'HERO_UPDATE_FAILED',
        // Validation messages are written for the admin; 5xx details stay server-side.
        message: status < 500 ? error.message : fallbackMessage,
        ...(error.invalidMovies ? { invalidMovies: error.invalidMovies } : {}),
    });
};

export const updateHeroSettings = async (req, res) => {
    try {
        const result = await updateHomeHero(req.body || {});
        return res.json({
            success: true,
            message: 'Hero poster settings updated successfully.',
            settings: result.settings,
            liveHero: result.liveHero,
            meta: result.meta,
        });
    } catch (error) {
        return failHeroAction(res, 'admin-hero-update-failed', error, 'Unable to update hero settings.');
    }
};

export const randomizeHeroAction = async (_req, res) => {
    try {
        const hero = await randomizeHomeHero();
        return res.json({
            success: true,
            message: 'Hero posters were reshuffled with a fresh daily seed.',
            hero,
        });
    } catch (error) {
        return failHeroAction(res, 'admin-hero-randomize-failed', error, 'Unable to randomize the hero.');
    }
};

export const refreshCatalogAction = async (req, res) => {
    const runId = randomUUID();
    try {
        const { dryRun } = req.body;
        if (typeof dryRun !== 'undefined' && typeof dryRun !== 'boolean') {
            return res.status(400).json({ success: false, message: 'dryRun must be a boolean.' });
        }
        if (typeof inngest?.send !== 'function') {
            return res.status(503).json({ success: false, message: 'Catalog refresh queue is unavailable.' });
        }
        const requestedBy = req.auth()?.userId || 'admin';
        await queueCatalogRefreshRun({ runId, source: 'admin', requestedBy, dryRun: Boolean(dryRun) });
        await inngest.send({
            id: runId,
            name: 'catalog/refresh.requested',
            data: { runId, dryRun: Boolean(dryRun), requestedBy },
        });
        return res.status(202).json({ success: true, jobId: runId, status: 'queued' });
    } catch (error) {
        console.error(JSON.stringify({
            event: 'catalog-refresh-queue-failed',
            runId,
            errorCode: error?.code || error?.name || 'UNKNOWN',
        }));
        await failQueuedCatalogRefreshRun(runId, error).catch(() => undefined);
        return res.status(503).json({ success: false, message: 'Unable to queue catalog refresh.' });
    }
};

export const getCatalogRefreshStatusAction = async (req, res) => {
    try {
        const runId = String(req.params.runId || '').trim();
        if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(runId)) {
            return res.status(400).json({ success: false, message: 'Invalid catalog refresh job ID.' });
        }
        const run = await getCatalogRefreshRun(runId);
        if (!run) return res.status(404).json({ success: false, message: 'Catalog refresh job not found.' });
        return res.json({ success: true, job: run });
    } catch (error) {
        console.error(JSON.stringify({
            event: 'catalog-refresh-status-failed',
            errorCode: error?.code || error?.name || 'UNKNOWN',
        }));
        return res.status(500).json({ success: false, message: 'Unable to read catalog refresh status.' });
    }
};
