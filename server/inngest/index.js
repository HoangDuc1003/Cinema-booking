import { Inngest } from 'inngest';
import connectDB from '../configs/db.js';
import User from '../models/User.js';
import { reconcileHeroAssets } from '../services/heroVideoService.js';
import { getISOWeekKey, refreshWeeklyCatalog, rotateActiveCatalogSlot } from '../services/catalogRefreshService.js';

// Gracefully handle missing Inngest keys (avoids crashing on Vercel)
let inngest;
let functions = [];

const executeCatalogRefresh = async (options) => {
    try {
        return await refreshWeeklyCatalog(options);
    } catch (error) {
        if (error?.transient) throw error;
        return { success: false, permanent: true, errorCode: error?.code || 'CATALOG_REFRESH_FAILED' };
    }
};

try {
    // Create Inngest client
    inngest = new Inngest({ id: "Cinema-booking" });

    // Background job: Weekly catalog refresh
    const weeklyCatalogRefresh = inngest.createFunction(
        {
            id: "weekly-catalog-refresh",
            cron: "TZ=Asia/Ho_Chi_Minh 0 3 * * 1",
            retries: 3,
            concurrency: { limit: 1, key: '"catalog-refresh"', scope: 'env' },
        },
        async ({ event, step }) => {
            await connectDB();
            const scheduledAt = new Date(event?.ts || Date.now());
            const runId = `cron:${getISOWeekKey(scheduledAt)}:${scheduledAt.toISOString()}`;
            return step.run('refresh-weekly-catalog', () => executeCatalogRefresh({
                source: 'cron',
                runId,
                requestedBy: 'inngest-cron',
                now: scheduledAt,
            }));
        }
    );

    const requestedCatalogRefresh = inngest.createFunction(
        {
            id: 'requested-catalog-refresh',
            retries: 3,
            concurrency: { limit: 1, key: '"catalog-refresh"', scope: 'env' },
            triggers: [{ event: 'catalog/refresh.requested' }],
        },
        async ({ event, step }) => {
            await connectDB();
            const { runId, dryRun, requestedBy } = event.data;
            return step.run('refresh-requested-catalog', () => executeCatalogRefresh({
                source: 'admin',
                runId,
                dryRun: Boolean(dryRun),
                requestedBy,
            }));
        },
    );

    // Background job: Rotate active catalog slot
    const rotateActiveCatalogSlotJob = inngest.createFunction(
        { id: "rotate-active-catalog-slot", cron: "TZ=Asia/Ho_Chi_Minh 0 8,20 * * *" },
        async () => {
            await connectDB();
            await rotateActiveCatalogSlot();
            return { success: true };
        }
    );

    // Sync user creation from Clerk to MongoDB
    const syncUserCreation = inngest.createFunction(
        {
            id: 'sync-user-from-clerk',
            triggers: [{ event: 'clerk/user.created' }]
        },
        async ({ event }) => {
            await connectDB();

            const { id, first_name, last_name, email_addresses, image_url } = event.data;

            const userData = {
                _id: id,
                email: email_addresses?.[0]?.email_address || '',
                name: `${first_name || ''} ${last_name || ''}`.trim() || 'User',
                image: image_url || ''
            };

            await User.create(userData);
            return { success: true, userId: id };
        }
    );

    // Delete user from MongoDB when deleted in Clerk
    const syncUserDeletion = inngest.createFunction(
        {
            id: 'delete-user-with-clerk',
            triggers: [{ event: 'clerk/user.deleted' }]
        },
        async ({ event }) => {
            await connectDB();

            const { id } = event.data;
            const result = await User.findByIdAndDelete(id);
            return { success: true, deleted: !!result, userId: id };
        }
    );

    // Update user in MongoDB when updated in Clerk
    const syncUserUpdation = inngest.createFunction(
        {
            id: 'update-user-from-clerk',
            triggers: [{ event: 'clerk/user.updated' }]
        },
        async ({ event }) => {
            await connectDB();

            const { id, first_name, last_name, email_addresses, image_url } = event.data;

            const userData = {
                email: email_addresses?.[0]?.email_address || '',
                name: `${first_name || ''} ${last_name || ''}`.trim() || 'User',
                image: image_url || ''
            };

            await User.findByIdAndUpdate(id, userData);
            return { success: true, userId: id };
        }
    );

    // Background job: Reconcile Hero native assets twice daily (00:00 and 12:00)
    const reconcileHeroAssetsJob = inngest.createFunction(
        { id: "reconcile-hero-assets", cron: "0 0,12 * * *" },
        async () => {
            await connectDB();
            const result = await reconcileHeroAssets();
            return result;
        }
    );

    // Export all functions for the Inngest serve handler
    functions = [
        syncUserCreation,
        syncUserDeletion,
        syncUserUpdation,
        weeklyCatalogRefresh,
        requestedCatalogRefresh,
        rotateActiveCatalogSlotJob,
        reconcileHeroAssetsJob
    ];
} catch (error) {
    console.warn('[Inngest] Initialization skipped — missing config:', error.message);
    // Create a minimal dummy client so the serve() handler doesn't crash
    inngest = { id: 'Cinema-booking' };
}

export { inngest, functions };
