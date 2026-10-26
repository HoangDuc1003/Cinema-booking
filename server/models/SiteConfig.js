import mongoose from 'mongoose';

const siteConfigSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        homeHero: {
            mode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
            movieIds: { type: [String], default: [] },
        },
        catalog: {
            activeBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogBatch' },
            refreshing: { type: Boolean },
            activeSlot: { type: Number },
            lastRotationAt: { type: Date },
            lastSuccessfulRefreshAt: { type: Date },
            lastFencingToken: { type: Number, default: 0 },
        },
    },
    { timestamps: true },
);

const SiteConfig = mongoose.model('SiteConfig', siteConfigSchema);
export default SiteConfig;
