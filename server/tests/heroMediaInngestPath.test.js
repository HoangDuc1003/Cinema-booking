import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createHeroMediaIngestFunction,
    createHeroMediaRequestedFunction,
    createHeroMediaVerifyFunction,
    createHeroPoolReconcileFunction,
    heroMediaPipelineRuntime,
} from '../inngest/functions/heroMediaPipeline.js';

const createFakeInngest = () => {
    const functions = new Map();
    return {
        functions,
        createFunction: (options, handler) => {
            const entry = { opts: options, handler };
            functions.set(options.id, entry);
            return entry;
        },
    };
};

const createStep = (sentEvents) => ({
    run: async (_name, operation) => operation(),
    sendEvent: async (_name, event) => sentEvents.push(event),
});

test('Hero media Inngest chain sends requested -> ingest -> verify -> reconcile events', async (t) => {
    const originalRuntime = { ...heroMediaPipelineRuntime };
    t.after(() => Object.assign(heroMediaPipelineRuntime, originalRuntime));

    const calls = [];
    Object.assign(heroMediaPipelineRuntime, {
        connectDB: async () => calls.push('connect'),
        loadAsset: async (assetId) => ({ _id: assetId, sourceStatus: 'ready_for_ingestion', status: 'pending' }),
        ingest: async ({ assetId }) => ({ assetId, shouldVerify: true }),
        verify: async ({ assetId, reconcile }) => ({ assetId, reconcile, verified: true }),
        reconcile: async ({ source }) => ({ source, promoted: 2 }),
    });

    const inngest = createFakeInngest();
    createHeroMediaRequestedFunction(inngest);
    createHeroMediaIngestFunction(inngest);
    createHeroMediaVerifyFunction(inngest);
    createHeroPoolReconcileFunction(inngest);

    const requested = inngest.functions.get('hero-media-requested');
    const ingest = inngest.functions.get('hero-media-ingest');
    const verify = inngest.functions.get('hero-media-verify');
    const reconcile = inngest.functions.get('hero-pool-reconcile');
    assert.deepEqual(requested.opts.triggers, [{ event: 'hero/media.requested' }]);
    assert.deepEqual(ingest.opts.triggers, [{ event: 'hero/media.ingest' }]);
    assert.equal(ingest.opts.concurrency.limit, 1);
    assert.deepEqual(verify.opts.triggers, [{ event: 'hero/media.verify' }]);
    assert.deepEqual(reconcile.opts.triggers, [{ event: 'hero/pool.reconcile' }]);

    const sentEvents = [];
    const requestedResult = await requested.handler({
        event: { data: { assetId: 'asset-1' } },
        step: createStep(sentEvents),
    });
    assert.deepEqual(requestedResult, { success: true, status: 'queued' });
    assert.deepEqual(sentEvents.splice(0), [{ name: 'hero/media.ingest', data: { assetId: 'asset-1' } }]);

    const ingestResult = await ingest.handler({
        event: { data: { assetId: 'asset-1' } },
        step: createStep(sentEvents),
    });
    assert.deepEqual(ingestResult, { assetId: 'asset-1', shouldVerify: true });
    assert.deepEqual(sentEvents.splice(0), [{ name: 'hero/media.verify', data: { assetId: 'asset-1' } }]);

    const verifyResult = await verify.handler({
        event: { data: { assetId: 'asset-1' } },
        step: createStep(sentEvents),
    });
    assert.deepEqual(verifyResult, { assetId: 'asset-1', reconcile: false, verified: true });
    assert.deepEqual(sentEvents.splice(0), [{ name: 'hero/pool.reconcile', data: { source: 'media-verification' } }]);

    const reconcileResult = await reconcile.handler({
        event: { data: { source: 'media-verification' } },
        step: createStep(sentEvents),
    });
    assert.deepEqual(reconcileResult, { source: 'media-verification', promoted: 2 });
    assert.equal(calls.filter((call) => call === 'connect').length, 4);
});

test('a live ingestion lease asks Inngest to retry after the lease expires', async (t) => {
    const originalRuntime = { ...heroMediaPipelineRuntime };
    t.after(() => Object.assign(heroMediaPipelineRuntime, originalRuntime));
    const retryAfter = new Date('2026-08-08T12:05:00Z');
    Object.assign(heroMediaPipelineRuntime, {
        connectDB: async () => undefined,
        ingest: async () => {
            const error = new Error('already ingesting');
            error.code = 'HERO_MEDIA_INGESTION_LEASED';
            error.transient = true;
            error.retryAfter = retryAfter;
            throw error;
        },
    });
    const inngest = createFakeInngest();
    createHeroMediaIngestFunction(inngest);

    await assert.rejects(
        inngest.functions.get('hero-media-ingest').handler({
            event: { data: { assetId: 'asset-1' } },
            step: createStep([]),
        }),
        (error) => error.name === 'RetryAfterError'
            && Number.isFinite(Date.parse(error.retryAfter)),
    );
});
