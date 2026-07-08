import mongoose from 'mongoose';

const siteConfigSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        homeHero: {
            mode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
            movieIds: { type: [String], default: [] },
        },
    },
    { timestamps: true },
);

const SiteConfig = mongoose.model('SiteConfig', siteConfigSchema);
export default SiteConfig;
