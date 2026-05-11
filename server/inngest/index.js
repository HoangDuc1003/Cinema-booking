import { Inngest } from 'inngest';
import connectDB from '../configs/db.js';
import User from '../models/User.js';
import { importTrendingMoviesLogic } from '../services/movieService.js';

// Create Inngest client
export const inngest = new Inngest({ id: "Cinema-booking" });

// Background job: Daily trending movie import
const dailyTrendingImport = inngest.createFunction(
    { id: "daily-trending-import", cron: "0 0 * * *" },
    async () => {
        await connectDB();
        const result = await importTrendingMoviesLogic();
        return { success: true, count: result.count };
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

// Export all functions for the Inngest serve handler
export const functions = [
    syncUserCreation,
    syncUserDeletion,
    syncUserUpdation,
    dailyTrendingImport
];

