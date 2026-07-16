import mongoose from "mongoose";

const catalogBatchSchema = new mongoose.Schema(
    {
        weekKey: {
            type: String,
            required: true
        },
        version: { type: Number, required: true, min: 1 },
        runId: { type: String, required: true },
        fencingToken: { type: Number, required: true, min: 1 },
        status: {
            type: String,
            required: true,
            enum: ["building", "staging", "active", "retired", "failed"]
        },
        buckets: {
            newest: {
                type: [String],
                validate: {
                    validator: function(val) {
                        const status = this ? (this.status || (this.getUpdate && this.getUpdate().status)) : null;
                        if (status === 'failed' || status === 'building') return true;
                        if (!Array.isArray(val)) return false;
                        if (val.length !== 50) return false;
                        return new Set(val).size === 50;
                    },
                    message: "newest bucket must contain exactly 50 unique movie IDs"
                }
            },
            classics: {
                type: [String],
                validate: {
                    validator: function(val) {
                        const status = this ? (this.status || (this.getUpdate && this.getUpdate().status)) : null;
                        if (status === 'failed' || status === 'building') return true;
                        if (!Array.isArray(val)) return false;
                        if (val.length !== 50) return false;
                        return new Set(val).size === 50;
                    },
                    message: "classics bucket must contain exactly 50 unique movie IDs"
                }
            },
            popular: {
                type: [String],
                validate: {
                    validator: function(val) {
                        const status = this ? (this.status || (this.getUpdate && this.getUpdate().status)) : null;
                        if (status === 'failed' || status === 'building') return true;
                        if (!Array.isArray(val)) return false;
                        if (val.length !== 50) return false;
                        return new Set(val).size === 50;
                    },
                    message: "popular bucket must contain exactly 50 unique movie IDs"
                }
            }
        },
        movieIds: {
            type: [String],
            validate: {
                validator: function(val) {
                    const status = this ? (this.status || (this.getUpdate && this.getUpdate().status)) : null;
                    if (status === 'failed' || status === 'building') return true;
                    if (!Array.isArray(val)) return false;
                    if (val.length !== 150) return false;
                    if (new Set(val).size !== 150) return false;
                    const bucketIds = [
                        ...(this?.buckets?.newest || []),
                        ...(this?.buckets?.popular || []),
                        ...(this?.buckets?.classics || []),
                    ];
                    const bucketSet = new Set(bucketIds);
                    return bucketIds.length === 150
                        && bucketSet.size === 150
                        && val.every((id) => bucketSet.has(id));
                },
                message: "movieIds must exactly match 150 globally unique bucket movie IDs"
            }
        },
        generatedAt: {
            type: Date
        },
        validatedAt: {
            type: Date
        },
        activatedAt: {
            type: Date,
            index: true
        },
        retiredAt: {
            type: Date
        },
        sourceMeta: {
            source: { type: String },
            region: { type: String },
            language: { type: String },
            newestPages: { type: [Number] },
            classicPages: { type: [Number] },
            popularPages: { type: [Number] }
        },
        metrics: {
            fetched: { type: Number },
            rejected: { type: Number },
            duplicates: { type: Number },
            detailsFetched: { type: Number }
        },
        failureReason: { type: String }
    },
    {
        timestamps: true
    }
);

catalogBatchSchema.index({ weekKey: 1, version: 1 }, { unique: true, name: 'catalog_week_version_unique' });
catalogBatchSchema.index({ runId: 1 }, { unique: true, sparse: true, name: 'catalog_run_unique' });
catalogBatchSchema.index(
    { status: 1 },
    { unique: true, partialFilterExpression: { status: 'active' }, name: 'catalog_single_active' },
);

const CatalogBatch = mongoose.model("CatalogBatch", catalogBatchSchema);
export default CatalogBatch;
