import mongoose from "mongoose";

const catalogBatchSchema = new mongoose.Schema(
    {
        weekKey: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        status: {
            type: String,
            required: true,
            enum: ["staging", "active", "retired", "failed"],
            index: true
        },
        buckets: {
            newest: {
                type: [String],
                validate: {
                    validator: function(val) {
                        const status = this ? (this.status || (this.getUpdate && this.getUpdate().status)) : null;
                        if (status === 'failed') return true;
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
                        if (status === 'failed') return true;
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
                        if (status === 'failed') return true;
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
                    if (status === 'failed') return true;
                    if (!Array.isArray(val)) return false;
                    if (val.length !== 150) return false;
                    return new Set(val).size === 150;
                },
                message: "movieIds must contain exactly 150 globally unique movie IDs"
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

const CatalogBatch = mongoose.model("CatalogBatch", catalogBatchSchema);
export default CatalogBatch;
