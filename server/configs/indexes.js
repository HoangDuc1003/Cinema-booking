import Booking from '../models/Booking.js';
import SeatReservation from '../models/SeatReservation.js';
import CatalogBatch from '../models/CatalogBatch.js';
import CatalogRefreshRun from '../models/CatalogRefreshRun.js';

const state = globalThis.__nitroCineIndexState || { promise: null, ready: false };
globalThis.__nitroCineIndexState = state;

export const ensureCriticalIndexes = async () => {
    if (state.ready) return true;
    if (!state.promise) {
        state.promise = Promise.all([
            Booking.init(),
            SeatReservation.init(),
            CatalogBatch.init(),
            CatalogRefreshRun.init(),
        ]).then(() => verifyCatalogV2Indexes()).then(() => {
            state.ready = true;
            return true;
        }).catch((error) => {
            state.promise = null;
            throw error;
        });
    }
    return state.promise;
};

export const verifyCatalogV2Indexes = async () => {
    const indexes = await CatalogBatch.collection.indexes();
    const byName = new Map(indexes.map((index) => [index.name, index]));
    const required = {
        catalog_week_version_unique: { key: { weekKey: 1, version: 1 }, unique: true },
        catalog_run_unique: { key: { runId: 1 }, unique: true, sparse: true },
        catalog_single_active: { key: { status: 1 }, unique: true, partialFilterExpression: { status: 'active' } },
    };
    const invalid = Object.entries(required).filter(([name, shape]) => {
        const actual = byName.get(name);
        return !actual || Object.entries(shape).some(([key, value]) => JSON.stringify(actual[key]) !== JSON.stringify(value));
    }).map(([name]) => name);
    if (invalid.length) throw new Error(`Catalog v2 migration required; missing or invalid indexes: ${invalid.join(', ')}`);
    if (byName.has('weekKey_1')) throw new Error('Catalog v2 migration required; legacy weekKey_1 index still exists');
    return true;
};

export default ensureCriticalIndexes;
