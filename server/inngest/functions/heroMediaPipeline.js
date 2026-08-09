import connectDB from '../../configs/db.js';
import HeroMediaAsset from '../../models/HeroMediaAsset.js';
import {
    ingestAuthorizedHeroMedia,
    verifyIngestedHeroMedia,
} from '../../services/heroMediaIngestionService.js';
import { reconcilePreparingHeroBatches } from '../../services/heroRotationService.js';

// Kept as a single runtime boundary so the event choreography can be verified
// without a database, Cloudinary, or an Inngest account.
export const heroMediaPipelineRuntime = {
    connectDB,
    loadAsset: (assetId) => HeroMediaAsset.findById(assetId).lean(),
    ingest: ingestAuthorizedHeroMedia,
    verify: verifyIngestedHeroMedia,
    reconcile: reconcilePreparingHeroBatches,
};

export const createHeroMediaRequestedFunction = (inngestClient) => inngestClient.createFunction(
    {
        id: 'hero-media-requested',
        retries: 2,
        concurrency: { limit: 4, key: 'event.data.assetId', scope: 'env' },
        triggers: [{ event: 'hero/media.requested' }],
    },
    async ({ event, step }) => {
        await heroMediaPipelineRuntime.connectDB();
        const assetId = String(event.data?.assetId || '').trim();
        const asset = await step.run('load-approved-source', () => heroMediaPipelineRuntime.loadAsset(assetId));
        if (!asset) return { success: false, code: 'HERO_MEDIA_ASSET_NOT_FOUND' };
        if (asset.status === 'ready') return { success: true, reused: true };
        if (asset.sourceStatus !== 'ready_for_ingestion') {
            return { success: false, code: 'NEEDS_AUTHORIZED_SOURCE' };
        }
        await step.sendEvent('queue-authorized-ingestion', {
            name: 'hero/media.ingest',
            data: { assetId },
        });
        return { success: true, status: 'queued' };
    },
);

export const createHeroMediaIngestFunction = (inngestClient) => inngestClient.createFunction(
    {
        id: 'hero-media-ingest',
        retries: 3,
        concurrency: { limit: 2, key: 'event.data.assetId', scope: 'env' },
        triggers: [{ event: 'hero/media.ingest' }],
    },
    async ({ event, step }) => {
        await heroMediaPipelineRuntime.connectDB();
        const assetId = String(event.data?.assetId || '').trim();
        let result;
        try {
            result = await step.run('cloudinary-remote-upload', () => heroMediaPipelineRuntime.ingest({ assetId }));
        } catch (error) {
            if (error?.transient) throw error;
            return { success: false, code: error?.code || 'HERO_MEDIA_INGEST_FAILED' };
        }
        if (result.shouldVerify) {
            await step.sendEvent('queue-cloudinary-verification', {
                name: 'hero/media.verify',
                data: { assetId },
            });
        }
        return result;
    },
);

export const createHeroMediaVerifyFunction = (inngestClient) => inngestClient.createFunction(
    {
        id: 'hero-media-verify',
        retries: 3,
        concurrency: { limit: 2, key: 'event.data.assetId', scope: 'env' },
        triggers: [{ event: 'hero/media.verify' }],
    },
    async ({ event, step }) => {
        await heroMediaPipelineRuntime.connectDB();
        const assetId = String(event.data?.assetId || '').trim();
        try {
            const result = await step.run('verify-native-media', () => heroMediaPipelineRuntime.verify({
                assetId,
                reconcile: false,
            }));
            await step.sendEvent('reconcile-preparing-hero-pool', {
                name: 'hero/pool.reconcile',
                data: { source: 'media-verification' },
            });
            return result;
        } catch (error) {
            if (error?.transient) throw error;
            return { success: false, code: error?.code || 'HERO_MEDIA_VERIFY_FAILED' };
        }
    },
);

export const createHeroPoolReconcileFunction = (inngestClient) => inngestClient.createFunction(
    {
        id: 'hero-pool-reconcile',
        retries: 3,
        concurrency: { limit: 1, key: '"hero-pool-reconcile"', scope: 'env' },
        triggers: [{ event: 'hero/pool.reconcile' }],
    },
    async ({ event, step }) => {
        await heroMediaPipelineRuntime.connectDB();
        return step.run('reconcile-preparing-hero-batch', () => heroMediaPipelineRuntime.reconcile({
            source: event.data?.source || 'inngest',
        }));
    },
);

export default {
    createHeroMediaRequestedFunction,
    createHeroMediaIngestFunction,
    createHeroMediaVerifyFunction,
    createHeroPoolReconcileFunction,
};
