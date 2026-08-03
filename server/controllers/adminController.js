import Booking from "../models/Booking.js"
import Show from "../models/Show.js"
import User from "../models/User.js"
import {
    getAdminHomeHero,
    randomizeHomeHero,
    updateHeroSoundSettings,
    updateHomeHero,
} from "../services/heroService.js"
import { getUploadSignature, commitHeroVideo, removeHeroVideo } from "../services/heroVideoService.js"
import { refreshHeroRotation } from "../services/heroRotationService.js"
import { randomUUID } from 'node:crypto';
import { inngest } from '../inngest/index.js';
import {
    failQueuedCatalogRefreshRun,
    getCatalogRefreshRun,
    queueCatalogRefreshRun,
} from "../services/catalogRefreshService.js"

const serializeHeroVideoState = (movie) => ({
    id: String(movie?._id || movie?.id || ''),
    heroVideoStatus: movie?.heroVideoStatus || 'missing',
    heroVideoMimeType: movie?.heroVideoMimeType || '',
    heroVideoVersion: String(movie?.heroVideoVersion || ''),
    heroVideoDuration: Number(movie?.heroVideoDuration) || 0,
    heroVideoWidth: Number(movie?.heroVideoWidth) || 0,
    heroVideoHeight: Number(movie?.heroVideoHeight) || 0,
    heroVideoBytes: Number(movie?.heroVideoBytes) || 0,
    heroVideoVerifiedAt: movie?.heroVideoVerifiedAt || null,
});

export const isAdmin = async (req,res) => {
    res.json({success:true, isAdmin:true})
}

//api to get dashboard database
export const getDashboardData = async (req,res)=>{
    try {
        const bookings = await Booking.find({isPaid:true})
        const activeShows = await Show.find({showDateTime:{$gte:new Date()}}).populate('movie');

        const totalUser = await User.countDocuments();
        const dashboardData = {
            totalBookings: bookings.length,
            totalRevenue:bookings.reduce((acc,booking)=>acc+booking.amount,0),
            activeShows,
            totalUser
        }
        res.json({success:true,dashboardData});
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

//api to get all shows
export const getAllShows = async (req,res) =>{
    try {
        const shows = await Show.find({showDateTime:{$gte:new Date()}}).populate('movie').sort({showDateTime:1});
        res.json({success:true,shows});
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

//api to get all booking 
export const getAllBookings = async (req,res) =>{
    try {
        const bookings = await Booking.find({}).populate('user').populate({
            path:"show",
            populate:{path:"movie"}
        }).sort({createdAt:-1});
        res.json({success:true,bookings});
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const getHeroSettings = async (req,res) =>{
    try {
        const hero = await getAdminHomeHero();
        res.json({success:true,hero});
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const updateHeroSettings = async (req, res) => {
    try {
        const result = await updateHomeHero(req.body || {});
        return res.json({
            success: true,
            message: "Hero updated successfully.",
            settings: result.settings,
            liveHero: result.liveHero,
            meta: result.meta,
        });
    } catch (error) {
        return res.status(error.status || error.statusCode || 500).json({
            success: false,
            code: error.code || 'HERO_UPDATE_FAILED',
            message: error.message,
            invalidMovies: error.invalidMovies || undefined,
        });
    }
};

export const randomizeHeroAction = async (req, res) => {
    try {
        const requestedBy = req.auth()?.userId || 'admin';
        const hero = await randomizeHomeHero({
            requestedBy,
            selectionSeed: req.body?.selectionSeed,
        });
        res.json({ success: true, message: "Hero selection randomized within the active 15-movie pool.", hero });
    } catch (error) {
        return res.status(error.status || error.statusCode || 500).json({
            success: false,
            code: error.code,
            message: error.message,
        });
    }
}

export const refreshHeroRotationAction = async (req, res) => {
    try {
        const requestedBy = req.auth()?.userId || 'admin';
        const idempotencyKey = req.body?.idempotencyKey;
        if (
            idempotencyKey !== undefined
            && !/^[a-zA-Z0-9:_-]{8,160}$/.test(String(idempotencyKey))
        ) {
            return res.status(400).json({
                success: false,
                code: 'HERO_IDEMPOTENCY_KEY_INVALID',
                message: 'idempotencyKey must contain 8-160 safe characters.',
            });
        }
        const result = await refreshHeroRotation({
            source: 'admin',
            requestedBy,
            force: true,
            runId: idempotencyKey,
        });
        return res.json({ success: true, result });
    } catch (error) {
        return res.status(error.status || error.statusCode || 500).json({
            success: false,
            code: error.code || 'HERO_REFRESH_FAILED',
            message: error.message,
            details: error.details || undefined,
        });
    }
}

export const updateHeroSoundAction = async (req, res) => {
    try {
        const settings = await updateHeroSoundSettings(req.body || {});
        return res.json({ success: true, settings });
    } catch (error) {
        return res.status(error.status || error.statusCode || 500).json({
            success: false,
            code: error.code,
            message: error.message,
        });
    }
}

export const getHeroVideoSignature = async (req, res) => {
    try {
        const { movieId } = req.query;
        if (!movieId) throw new Error("Missing movieId");
        const signatureData = await getUploadSignature(movieId);
        res.json({ success: true, signatureData });
    } catch (error) {
        return res.status(error.status || error.statusCode || 500).json({
            success: false,
            code: error.code,
            message: error.message,
            details: error.details || undefined,
        });
    }
}

export const commitHeroVideoAction = async (req, res) => {
    try {
        const { movieId } = req.params;
        const result = await commitHeroVideo(movieId, req.body || {});
        res.json({
            success: true,
            message: "Video committed successfully.",
            movie: serializeHeroVideoState(result.movie || result),
            activation: result.activation || null,
        });
    } catch (error) {
        return res.status(error.status || error.statusCode || 500).json({
            success: false,
            code: error.code,
            message: error.message,
            details: error.details || undefined,
        });
    }
}

export const removeHeroVideoAction = async (req, res) => {
    try {
        const { movieId } = req.params;
        const movie = await removeHeroVideo(movieId);
        res.json({
            success: true,
            message: "Video removed successfully.",
            movie: serializeHeroVideoState(movie),
        });
    } catch (error) {
        return res.status(error.status || error.statusCode || 500).json({
            success: false,
            code: error.code,
            message: error.message,
        });
    }
}

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
        console.log(error);
        await failQueuedCatalogRefreshRun(runId, error).catch(() => undefined);
        return res.status(503).json({ success: false, message: 'Unable to queue catalog refresh.' });
    }
}

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
        console.log(error);
        return res.status(500).json({ success: false, message: 'Unable to read catalog refresh status.' });
    }
}
