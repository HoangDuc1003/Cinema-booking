import mongoose from 'mongoose';

const defaultHeroVolume = () => {
    const configured = Number(process.env.HERO_DEFAULT_VOLUME || 0.35);
    return Number.isFinite(configured) && configured >= 0 && configured <= 1 ? configured : 0.35;
};

const siteConfigSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        homeHero: {
            mode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
            movieIds: { type: [String], default: [] },
            heroSoundDefaultEnabled: { type: Boolean, default: false },
            heroDefaultVolume: { type: Number, min: 0, max: 1, default: defaultHeroVolume },
            randomHistory: [
                {
                    movieIds: { type: [String], default: [] },
                    timestamp: { type: Date, default: Date.now },
                },
            ],
        },
        heroRotation: {
            activeBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'HeroRotationBatch', default: null },
            lastSuccessfulRefreshAt: { type: Date, default: null },
            nextRefreshAt: { type: Date, default: null },
            cacheGeneration: {
                type: Number,
                min: 0,
                default: 0,
                validate: {
                    validator: Number.isInteger,
                    message: 'heroRotation.cacheGeneration must be an integer',
                },
            },
            lastFencingToken: {
                type: Number,
                min: 0,
                default: 0,
                validate: {
                    validator: Number.isInteger,
                    message: 'heroRotation.lastFencingToken must be an integer',
                },
            },
            refreshing: { type: Boolean, default: false },
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
