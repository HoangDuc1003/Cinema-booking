import mongoose from 'mongoose';

const catalogRefreshRunSchema = new mongoose.Schema({
    runId: { type: String, required: true },
    source: { type: String, required: true, enum: ['cli', 'cron', 'admin'] },
    requestedBy: { type: String, default: 'system' },
    dryRun: { type: Boolean, default: false },
    status: { type: String, required: true, enum: ['queued', 'running', 'succeeded', 'failed'], index: true },
    weekKey: { type: String, required: true, index: true },
    targetVersion: { type: Number },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogBatch' },
    fencingToken: { type: Number },
    currentPhase: { type: String, default: 'queued' },
    attemptCount: { type: Number, default: 0 },
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    errorCode: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
    startedAt: { type: Date },
    completedAt: { type: Date },
}, { timestamps: true });

catalogRefreshRunSchema.index({ runId: 1 }, { unique: true, name: 'catalog_refresh_run_unique' });
catalogRefreshRunSchema.index({ status: 1, updatedAt: -1 }, { name: 'catalog_refresh_status_updated' });

const CatalogRefreshRun = mongoose.model('CatalogRefreshRun', catalogRefreshRunSchema);
export default CatalogRefreshRun;
