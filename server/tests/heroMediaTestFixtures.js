export const registeredHeroAssetForMovie = (movie, overrides = {}) => ({
    _id: `asset-${String(movie._id)}`,
    movieId: String(movie._id),
    source: {
        type: 'ADMIN_UPLOAD',
        provider: 'cloudinary',
        reference: String(movie.heroVideoId || ''),
    },
    rights: { status: 'USER_OWNED' },
    status: 'ready',
    sourceStatus: 'ready_for_ingestion',
    cloudinaryPublicId: String(
        movie.heroVideoPublicId
        || movie.heroVideoStorageId
        || movie.heroVideoId
        || '',
    ),
    secureUrl: String(movie.heroVideoUrl || ''),
    posterUrl: String(movie.heroVideoPosterUrl || ''),
    mimeType: String(movie.heroVideoMimeType || ''),
    duration: Number(movie.heroVideoDuration || 0),
    width: Number(movie.heroVideoWidth || 0),
    height: Number(movie.heroVideoHeight || 0),
    bytes: Number(movie.heroVideoBytes || 0),
    videoCodec: String(movie.heroVideoCodec || '').split('/')[0] || '',
    audioCodec: String(movie.heroVideoCodec || '').split('/')[1] || '',
    verificationStatus: 'verified',
    verifiedAt: movie.heroVideoVerifiedAt || new Date('2026-01-01T00:00:00Z'),
    ...overrides,
});

export const registeredHeroAssetsForMovies = (movies, movieIds) => {
    const ids = new Set((movieIds || movies.map((movie) => movie._id)).map(String));
    return movies
        .filter((movie) => ids.has(String(movie._id)))
        .map((movie) => registeredHeroAssetForMovie(movie));
};
