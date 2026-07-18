import connectDB from '../../configs/db.js';
import enrichCatalogHeroVideos from '../../services/heroVideoEnrichmentService.js';

export const createEnrichHeroVideosFunction = (inngestClient) => inngestClient.createFunction(
    {
        id: 'enrich-catalog-hero-videos',
        retries: 3,
        concurrency: { limit: 1, key: '"catalog-hero-enrich"', scope: 'env' },
        triggers: [
            { event: 'catalog/batch.activated' },
            { event: 'catalog/enrich.requested' },
        ],
    },
    async ({ event, step }) => {
        await connectDB();
        const { batchId, movieIds, force } = event.data || {};
        return step.run('run-hero-video-enrichment', () => enrichCatalogHeroVideos({
            batchId,
            movieIds,
            force: Boolean(force),
        }));
    },
);

export default createEnrichHeroVideosFunction;
