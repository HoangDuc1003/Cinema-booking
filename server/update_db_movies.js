import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

import Movie from './models/Movie.js';
import SiteConfig from './models/SiteConfig.js';
import { getPublicHomeHero } from './services/heroService.js';

async function updateDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the exact 5 movies that the auto mode will pick for today (index 0 or whatever current offset is)
    // Actually, getPublicHomeHero returns the currently active movies.
    const heroData = await getPublicHomeHero({ heroOffset: 0 }); // simulate slot 0 or current
    const currentMovies = heroData.movies || [];

    console.log(`Found ${currentMovies.length} active hero movies.`);

    if (currentMovies.length === 0) {
      console.log('No movies returned from getPublicHomeHero. Cannot update.');
      process.exit(1);
    }

    const movieIds = currentMovies.map(m => m.id);

    // Update these movies in the database
    const updateResult = await Movie.updateMany(
      { _id: { $in: movieIds } },
      {
        $set: {
          heroVideoUrl: '/mock/hero-trailer.mp4',
          heroVideoMimeType: 'video/mp4',
          heroVideoStatus: 'ready'
        }
      }
    );

    console.log(`Updated ${updateResult.modifiedCount} movies.`);
    
    // Explicitly set homeHero config to manual with these IDs just to guarantee they show up
    // as per user request: "cho 5 phim này ngẫu nghiên vào hôm nay đi nên hãy tải sẵn ở data để khi client vào dùng được luôn"
    await SiteConfig.findOneAndUpdate(
      { key: 'homeHero' },
      {
        $set: {
          'homeHero.mode': 'manual',
          'homeHero.movieIds': movieIds,
        }
      },
      { upsert: true }
    );
    console.log('Set homeHero mode to manual with the 5 selected movies.');

    process.exit(0);
  } catch (error) {
    console.error('Error updating DB:', error);
    process.exit(1);
  }
}

updateDB();
