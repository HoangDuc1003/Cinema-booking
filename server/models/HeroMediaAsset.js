import mongoose from 'mongoose';

export const HERO_MEDIA_SOURCE_TYPES = Object.freeze([
    'CLOUDINARY_EXISTING',
    'AUTHORIZED_REMOTE_URL',
    'USER_STORAGE',
    'ADMIN_UPLOAD',
    'LICENSED_PROVIDER',
    'YOUTUBE_REFERENCE_ONLY',
]);

export const HERO_MEDIA_RIGHTS_STATUSES = Object.freeze([
    'AUTHORIZED',
    'USER_OWNED',
    'LICENSED',
    'UNKNOWN',
    'REJECTED',
]);

export const HERO_MEDIA_STATUSES = Object.freeze([
    'pending',
    'ingesting',
    'processing',
    'ready',
    'failed',
    'retired',
]);

const failureSchema = new mongoose.Schema({
    code: { type: String, trim: true, default: '' },
    message: { type: String, trim: true, default: '' },
    transient: { type: Boolean, default: false },
    occurredAt: { type: Date, default: null },
}, { _id: false });

const heroMediaAssetSchema = new mongoose.Schema({
    movieId: { type: String, required: true, trim: true },
    sourceIdentity: { type: String, required: true, trim: true },
    source: {
        type: { type: String, enum: HERO_MEDIA_SOURCE_TYPES, required: true },
        provider: { type: String, trim: true, default: '' },
        reference: { type: String, trim: true, default: '' },
        originalUrl: { type: String, trim: true, default: '', select: false },
        originalUrlHash: { type: String, trim: true, default: '' },
    },
    rights: {
        status: { type: String, enum: HERO_MEDIA_RIGHTS_STATUSES, required: true },
        approvedAt: { type: Date, default: null },
        approvedBy: { type: String, trim: true, default: '' },
        provenance: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    status: { type: String, enum: HERO_MEDIA_STATUSES, default: 'pending', index: true },
    sourceStatus: {
        type: String,
        enum: ['ready_for_ingestion', 'needs_authorized_source', 'rejected'],
        default: 'needs_authorized_source',
    },
    cloudinaryPublicId: { type: String, trim: true, default: '' },
    secureUrl: { type: String, trim: true, default: '' },
    posterUrl: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    format: { type: String, trim: true, default: '' },
    duration: { type: Number, min: 0, default: 0 },
    width: { type: Number, min: 0, default: 0 },
    height: { type: Number, min: 0, default: 0 },
    bytes: { type: Number, min: 0, default: 0 },
    videoCodec: { type: String, trim: true, default: '' },
    audioCodec: { type: String, trim: true, default: '' },
    checksum: { type: String, trim: true, default: '' },
    attribution: { type: String, trim: true, default: '' },
    verificationStatus: {
        type: String,
        enum: ['unverified', 'processing', 'verified', 'failed'],
        default: 'unverified',
    },
    verificationReasons: { type: [String], default: [] },
    verifiedAt: { type: Date, default: null },
    failure: { type: failureSchema, default: () => ({}) },
    ingestionAttempts: { type: Number, min: 0, default: 0 },
    lastIngestionAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
}, { timestamps: true });

heroMediaAssetSchema.index(
    { movieId: 1, sourceIdentity: 1 },
    { unique: true, name: 'hero_media_source_identity_unique' },
);
heroMediaAssetSchema.index(
    { cloudinaryPublicId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: 'ready', cloudinaryPublicId: { $gt: '' } },
        name: 'hero_media_ready_cloudinary_public_id_unique',
    },
);
heroMediaAssetSchema.index(
    { movieId: 1, status: 1, verifiedAt: -1 },
    { name: 'hero_media_movie_status' },
);
heroMediaAssetSchema.index(
    { status: 1, updatedAt: 1 },
    { name: 'hero_media_queue_status' },
);

const HeroMediaAsset = mongoose.model('HeroMediaAsset', heroMediaAssetSchema);
export default HeroMediaAsset;
