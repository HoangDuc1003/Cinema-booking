import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  showDateTime: Date,
  hall: String,
  source: String,
  region: String,
  bookingOpen: Boolean
});

const Show = mongoose.models.Show || mongoose.model('Show', schema, 'shows');

async function run() {
  const uri = 'mongodb://ndhoang13_db:ndhoang13@ac-nfi6jt4-shard-00-00.16g1p7j.mongodb.net:27017,ac-nfi6jt4-shard-00-01.16g1p7j.mongodb.net:27017,ac-nfi6jt4-shard-00-02.16g1p7j.mongodb.net:27017/nitrocine?ssl=true&replicaSet=atlas-f3jvj7-shard-0&authSource=admin&appName=Cluster0';
  await mongoose.connect(uri);
  const now = new Date();
  const nowPlusSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const query = {
    showDateTime: {
      $gte: now,
      $lt: nowPlusSevenDays
    },
    hall: { $ne: 'Virtual Hall' },
    source: 'tmdb-now-playing',
    region: 'VN',
    bookingOpen: true
  };
  
  const count = await Show.countDocuments(query);
  const futureCount = await Show.countDocuments({ showDateTime: { $gte: now } });
  const futureTmdbCount = await Show.countDocuments({ showDateTime: { $gte: now }, source: 'tmdb-now-playing' });
  
  const earliest = await Show.findOne(query).sort({ showDateTime: 1 });
  const latest = await Show.findOne(query).sort({ showDateTime: -1 });
  const distinctMovies = await Show.distinct('movie', query);
  
  console.log(JSON.stringify({
    count,
    futureCount,
    futureTmdbCount,
    earliest: earliest ? earliest.showDateTime : null,
    latest: latest ? latest.showDateTime : null,
    distinctMoviesCount: distinctMovies.length
  }, null, 2));
  
  await mongoose.disconnect();
}

run().catch(console.error);
