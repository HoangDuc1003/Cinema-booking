import Booking from "../models/Booking.js"
import Show from "../models/Show.js"
import User from "../models/User.js"
import { getAdminHomeHero, randomizeHomeHero, updateHomeHero } from "../services/heroService.js"
import { getUploadSignature, commitHeroVideo, removeHeroVideo } from "../services/heroVideoService.js"
import { randomUUID } from 'node:crypto';
import { inngest } from '../inngest/index.js';
import {
    failQueuedCatalogRefreshRun,
    getCatalogRefreshRun,
    queueCatalogRefreshRun,
} from "../services/catalogRefreshService.js"

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

export const updateHeroSettings = async (req,res) =>{
    try {
        const settings = await updateHomeHero(req.body || {});
        res.json({success:true,message:"Hero updated successfully.",settings});
    } catch (error) {
        console.log(error);
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
}

export const randomizeHeroAction = async (req, res) => {
    try {
        const hero = await randomizeHomeHero();
        res.json({ success: true, message: "Hero randomized successfully without 2-day duplicates.", hero });
    } catch (error) {
        console.log(error);
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
}

export const getHeroVideoSignature = async (req, res) => {
    try {
        const { movieId } = req.query;
        if (!movieId) throw new Error("Missing movieId");
        const signatureData = await getUploadSignature(movieId);
        res.json({ success: true, signatureData });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const commitHeroVideoAction = async (req, res) => {
    try {
        const { movieId } = req.params;
        const movie = await commitHeroVideo(movieId, req.body);
        res.json({ success: true, message: "Video committed successfully.", movie });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const removeHeroVideoAction = async (req, res) => {
    try {
        const { movieId } = req.params;
        const movie = await removeHeroVideo(movieId);
        res.json({ success: true, message: "Video removed successfully.", movie });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
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
