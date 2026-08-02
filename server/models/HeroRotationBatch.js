import mongoose from 'mongoose';

const COMPLETE_STATUSES = new Set(['active', 'retired']);
const CATEGORY_SIZE = 5;
const POOL_SIZE = 15;
const HERO_SIZE = 5;

const asIds = (value) => Array.isArray(value) ? value.map(String) : [];
const isUnique = (ids) => new Set(ids).size === ids.length;
const containsOnlyIds = (value) => (
    Array.isArray(value)
    && value.every((id) => typeof id === 'string' && id.trim() !== '' && id === id.trim())
);
const sameSet = (left, right) => {
    const rightSet = new Set(right);
    return left.length === right.length && left.every((id) => rightSet.has(id));
};

const categoryField = () => ({
    type: [String],
    default: [],
    validate: {
        validator(value) {
            const ids = asIds(value);
            return containsOnlyIds(value)
                && isUnique(ids)
                && ids.length <= CATEGORY_SIZE
                && (!COMPLETE_STATUSES.has(this.status) || ids.length === CATEGORY_SIZE);
        },
        message: `category movie IDs must be unique and contain exactly ${CATEGORY_SIZE} items for active or retired batches`,
    },
});

const heroRotationBatchSchema = new mongoose.Schema(
    {
        batchKey: { type: String, required: true, trim: true },
        version: {
            type: Number,
            required: true,
            min: 1,
            validate: {
                validator: Number.isInteger,
                message: 'version must be an integer',
            },
        },
        runId: {
            type: String,
            trim: true,
            set: (value) => String(value || '').trim() || undefined,
        },
        fencingToken: {
            type: Number,
            required: true,
            min: 1,
            validate: {
                validator: Number.isInteger,
                message: 'fencingToken must be an integer',
            },
        },
        status: {
            type: String,
            required: true,
            enum: ['building', 'active', 'retired', 'failed'],
            default: 'building',
        },
        generatedAt: { type: Date, required: true, default: Date.now },
        activatedAt: {
            type: Date,
            required() {
                return COMPLETE_STATUSES.has(this.status);
            },
        },
        retiredAt: {
            type: Date,
            required() {
                return this.status === 'retired';
            },
        },
        nextRefreshAt: {
            type: Date,
            required() {
                return COMPLETE_STATUSES.has(this.status);
            },
        },
        timezone: {
            type: String,
            required: true,
            default: 'Asia/Ho_Chi_Minh',
            trim: true,
        },
        selectionSeed: { type: String, required: true, trim: true },
        newestMovieIds: categoryField(),
        hotMovieIds: categoryField(),
        discoveryMovieIds: categoryField(),
        movieIds: {
            type: [String],
            default: [],
            validate: {
                validator(value) {
                    const movieIds = asIds(value);
                    const complete = COMPLETE_STATUSES.has(this.status);
                    if (!complete) {
                        return containsOnlyIds(value)
                            && isUnique(movieIds)
                            && movieIds.length <= POOL_SIZE;
                    }
                    const groupedIds = [
                        ...asIds(this.newestMovieIds),
                        ...asIds(this.hotMovieIds),
                        ...asIds(this.discoveryMovieIds),
                    ];
                    return containsOnlyIds(value)
                        && isUnique(groupedIds)
                        && isUnique(movieIds)
                        && movieIds.length <= POOL_SIZE
                        && movieIds.length === POOL_SIZE
                        && sameSet(movieIds, groupedIds);
                },
                message: `movieIds must exactly match the unique category union and contain ${POOL_SIZE} items for active or retired batches`,
            },
        },
        activeHeroMovieIds: {
            type: [String],
            default: [],
            validate: {
                validator(value) {
                    const activeIds = asIds(value);
                    const movieIds = asIds(this.movieIds);
                    const groups = [
                        asIds(this.newestMovieIds),
                        asIds(this.hotMovieIds),
                        asIds(this.discoveryMovieIds),
                    ];
                    const complete = COMPLETE_STATUSES.has(this.status);
                    if (!complete) {
                        return containsOnlyIds(value)
                            && isUnique(activeIds)
                            && activeIds.length <= HERO_SIZE;
                    }
                    return containsOnlyIds(value)
                        && isUnique(activeIds)
                        && activeIds.length <= HERO_SIZE
                        && activeIds.length === HERO_SIZE
                        && activeIds.every((id) => movieIds.includes(id))
                        && groups.every(
                            (groupIds) => activeIds.some((id) => groupIds.includes(id)),
                        );
                },
                message: `activeHeroMovieIds must be a unique pool subset of ${HERO_SIZE} items covering every category for active or retired batches`,
            },
        },
        previousBatchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HeroRotationBatch',
            default: null,
        },
        sourceMetadata: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
        },
        dailyEntropy: {
            type: String,
            trim: true,
            default: '',
        },
        failureReason: { type: String, trim: true, default: '' },
    },
    { timestamps: true },
);

heroRotationBatchSchema.index(
    { batchKey: 1 },
    { unique: true, name: 'hero_batch_key_unique' },
);
heroRotationBatchSchema.index(
    { runId: 1 },
    { unique: true, sparse: true, name: 'hero_run_unique' },
);
heroRotationBatchSchema.index(
    { status: 1 },
    {
        unique: true,
        partialFilterExpression: { status: 'active' },
        name: 'hero_single_active',
    },
);

const HeroRotationBatch = mongoose.model('HeroRotationBatch', heroRotationBatchSchema);
export default HeroRotationBatch;
