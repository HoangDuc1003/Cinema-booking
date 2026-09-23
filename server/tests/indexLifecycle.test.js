import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('public MongoDB reads skip booking index verification while mutations retain the gate', () => {
    const script = `
        import mongoose from 'mongoose';
        process.env.MONGODB_URI = 'mongodb://test.invalid/nitrocine';
        mongoose.connect = async () => ({ mocked: true });

        const [dbModule, bookingModule, seatModule, catalogModule, runModule] = await Promise.all([
            import('./configs/db.js'),
            import('./models/Booking.js'),
            import('./models/SeatReservation.js'),
            import('./models/CatalogBatch.js'),
            import('./models/CatalogRefreshRun.js'),
        ]);
        let indexInitCalls = 0;
        for (const model of [
            bookingModule.default,
            seatModule.default,
            catalogModule.default,
            runModule.default,
        ]) {
            model.init = async () => { indexInitCalls += 1; };
        }
        catalogModule.default.collection.indexes = async () => [
            { name: 'catalog_week_version_unique', key: { weekKey: 1, version: 1 }, unique: true },
            { name: 'catalog_run_unique', key: { runId: 1 }, unique: true, sparse: true },
            { name: 'catalog_single_active', key: { status: 1 }, unique: true, partialFilterExpression: { status: 'active' } },
        ];
        const connectDB = dbModule.default;
        await connectDB({ ensureIndexes: false });
        const publicReadCalls = indexInitCalls;
        await connectDB({ ensureIndexes: true });
        process.stdout.write(JSON.stringify({ publicReadCalls, mutationCalls: indexInitCalls }));
    `;
    const result = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', script],
        {
            cwd: fileURLToPath(new URL('..', import.meta.url)),
            env: { ...process.env, MONGODB_URI: '' },
            encoding: 'utf8',
            // Cold-starting Node and loading mongoose takes well over 5s when the whole
            // suite runs in parallel on Windows; the timeout only guards against a hang.
            timeout: 30_000,
        },
    );

    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const parsed = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(parsed.publicReadCalls, 0);
    assert.equal(parsed.mutationCalls, 4);
});
