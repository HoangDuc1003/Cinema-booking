import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarClockIcon,
  CheckIcon,
  RotateCcwIcon,
  SaveIcon,
  SearchIcon,
  ShuffleIcon,
  XIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { useAppContext } from '../../context/AppContext';
import apiClient from '../../lib/apiClient';

const MAX_HERO_MOVIES = 5;

const getImageUrl = (path, size = 'w342') => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const movieKey = (movie) => String(movie?._id || movie?.id || '');

const readErrorMessage = (error, fallback) => (
  error?.response?.data?.message || error?.message || fallback
);

const formatVietnamTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const PosterList = ({ movies }) => (
  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    {movies.map((movie, index) => (
      <article
        key={movieKey(movie) || index}
        className="hero-admin-poster overflow-hidden rounded-lg border border-white/10 bg-black/20"
        style={{ '--hero-admin-delay': `${index * 45}ms` }}
      >
        <img
          src={getImageUrl(movie.poster_path || movie.backdrop_path)}
          alt={movie.title || movie.name}
          loading="lazy"
          decoding="async"
          className="aspect-2/3 w-full bg-black/40 object-cover"
        />
        <p className="truncate px-2 py-2 text-sm font-medium">{index + 1}. {movie.title || movie.name}</p>
      </article>
    ))}
  </div>
);

const HeroSettings = () => {
  const { user } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [randomizing, setRandomizing] = useState(false);
  const [mode, setMode] = useState('auto');
  const [liveMovies, setLiveMovies] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [availableMovies, setAvailableMovies] = useState([]);
  const [heroMeta, setHeroMeta] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Applies a hero payload from any endpoint. Keeping this in one place means the
  // save and randomize responses refresh the page without a second round trip -
  // that extra fetch is what used to blank the page back to the skeleton.
  const applyHero = useCallback((hero) => {
    if (!hero) return;
    const savedIds = hero.settings?.movieIds?.length
      ? hero.settings.movieIds
      : (hero.manualSelection?.movieIds || []);
    const uniqueMovies = [...new Map([
      ...(hero.liveMovies || hero.movies || []),
      ...(hero.manualSelection?.movies || hero.selectedMovies || []),
      ...(hero.availableMovies || []),
    ].map((movie) => [movieKey(movie), movie])).values()];

    setMode(hero.settings?.mode || 'auto');
    setSelectedIds(savedIds.map(String));
    setLiveMovies(hero.liveMovies || hero.movies || []);
    setHeroMeta(hero.meta || null);
    // Randomize responds without the full library; keep the one already loaded.
    if (uniqueMovies.length) setAvailableMovies((current) => (
      uniqueMovies.length >= current.length ? uniqueMovies : current
    ));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const controller = new AbortController();

    // No synchronous setState here: the first state write happens after the await,
    // so the initial skeleton is driven by the `loading` initial value instead.
    void (async () => {
      try {
        const { data } = await apiClient.get('/api/admin/hero', { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!data.success) throw new Error(data.message || 'Unable to load Hero settings.');
        applyHero(data.hero);
      } catch (error) {
        if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return;
        toast.error(readErrorMessage(error, 'Unable to load Hero settings.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [applyHero, user]);

  const selectedMovies = useMemo(() => {
    const movieById = new Map(availableMovies.map((movie) => [movieKey(movie), movie]));
    return selectedIds.map((id) => movieById.get(id)).filter(Boolean);
  }, [availableMovies, selectedIds]);

  const filteredMovies = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return availableMovies;
    return availableMovies.filter((movie) => (
      String(movie.title || movie.name || '').toLowerCase().includes(query)
    ));
  }, [availableMovies, searchTerm]);

  const toggleMovie = useCallback((movieId) => {
    const id = String(movieId);
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_HERO_MOVIES) {
        toast.error(`Choose exactly ${MAX_HERO_MOVIES} posters.`);
        return current;
      }
      return [...current, id];
    });
  }, []);

  const moveSelectedMovie = useCallback((index, direction) => {
    setSelectedIds((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (mode === 'manual' && selectedIds.length !== MAX_HERO_MOVIES) {
      toast.error(`Choose exactly ${MAX_HERO_MOVIES} posters for manual mode.`);
      return;
    }
    setSaving(true);
    try {
      const { data } = await apiClient.put('/api/admin/hero', { mode, movieIds: selectedIds });
      if (!data.success) throw new Error(data.message || 'Unable to update Hero.');
      applyHero({
        settings: data.settings,
        liveMovies: data.liveHero?.movies || [],
        manualSelection: { movieIds: data.settings?.movieIds || selectedIds },
        meta: data.meta,
      });
      toast.success(data.message || 'Hero poster settings updated.');
    } catch (error) {
      const invalid = error?.response?.data?.invalidMovies;
      toast.error(invalid?.length
        ? `These movies are no longer available: ${invalid.join(', ')}`
        : readErrorMessage(error, 'Unable to update Hero.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRandomize = async () => {
    setRandomizing(true);
    try {
      const { data } = await apiClient.post('/api/admin/hero/randomize');
      if (!data.success) throw new Error(data.message || 'Unable to randomize Hero posters.');
      applyHero(data.hero);
      toast.success(data.message || 'Hero posters were reshuffled.');
    } catch (error) {
      toast.error(readErrorMessage(error, 'Unable to randomize Hero posters.'));
    } finally {
      setRandomizing(false);
    }
  };

  if (loading) return <Loading message="Loading Hero poster settings..." />;

  const nextRefreshLabel = formatVietnamTime(heroMeta?.nextRefreshAt);
  const isManualIncomplete = mode === 'manual' && selectedIds.length !== MAX_HERO_MOVIES;

  return (
    <div className="hero-admin relative max-w-6xl">
      <Title text1="Hero " text2="Posters" />

      <div className="mt-6 flex flex-col gap-6">
        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm uppercase tracking-widest text-gray-400">Home page Hero</p>
              <h2 className="mt-1 text-lg font-semibold">Five posters, reshuffled daily</h2>
              <p className="mt-1 text-sm text-gray-300">
                Auto mode reshuffles five posters once per Vietnam day with a fresh seed. Manual mode pins your five posters in this exact order.
              </p>
              {(nextRefreshLabel || heroMeta?.dateKey) && (
                <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-gray-400">
                  <CalendarClockIcon className="h-3.5 w-3.5" />
                  <span>
                    {heroMeta?.dateKey ? `Seed for ${heroMeta.dateKey}` : 'Daily seed'}
                    {nextRefreshLabel ? ` · next reshuffle ${nextRefreshLabel}` : ''}
                  </span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
                <button
                  type="button"
                  onClick={() => setMode('auto')}
                  aria-pressed={mode === 'auto'}
                  className={`rounded-md px-4 py-2 text-sm transition-all duration-200 ${mode === 'auto' ? 'bg-primary font-medium text-white shadow-md shadow-primary/30' : 'text-gray-300 hover:bg-white/10'}`}
                >
                  Daily auto
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  aria-pressed={mode === 'manual'}
                  className={`rounded-md px-4 py-2 text-sm transition-all duration-200 ${mode === 'manual' ? 'bg-primary font-medium text-white shadow-md shadow-primary/30' : 'text-gray-300 hover:bg-white/10'}`}
                >
                  Manual five
                </button>
              </div>
              <button
                type="button"
                onClick={handleRandomize}
                disabled={randomizing}
                className="inline-flex items-center gap-2 rounded-md border border-primary/60 px-4 py-2 text-sm font-medium text-primary transition-all duration-200 hover:bg-primary/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShuffleIcon className={`h-4 w-4${randomizing ? ' animate-spin' : ''}`} />
                {randomizing ? 'Randomizing…' : 'Randomize five'}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Currently live on Home</h2>
              <p className="text-sm text-gray-400">The five posters visitors see today.</p>
            </div>
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {liveMovies.length}/{MAX_HERO_MOVIES} posters
            </span>
          </div>
          <PosterList movies={liveMovies} />
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Manual selection</h2>
              <p className="text-sm text-gray-400">Choose and order the five posters used in manual mode.</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-md border border-white/10 p-2 text-gray-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Clear selected Hero posters"
            >
              <RotateCcwIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {selectedMovies.length === 0 ? (
              <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-white/15 px-6 text-center text-sm text-gray-500">
                Choose five posters from the library below.
              </div>
            ) : selectedMovies.map((movie, index) => (
              <div
                key={movieKey(movie)}
                className="hero-admin-row grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-black/25 p-2"
              >
                <img
                  src={getImageUrl(movie.poster_path || movie.backdrop_path)}
                  alt={movie.title || movie.name}
                  loading="lazy"
                  decoding="async"
                  className="h-20 w-14 rounded-md bg-black/40 object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">{index + 1}. {movie.title || movie.name}</p>
                  <p className="text-xs text-gray-500">{movie.release_date?.slice(0, 4) || 'N/A'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveSelectedMovie(index, -1)} disabled={index === 0} className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30" aria-label="Move poster up"><ArrowUpIcon className="h-4 w-4" /></button>
                  <button type="button" onClick={() => moveSelectedMovie(index, 1)} disabled={index === selectedMovies.length - 1} className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30" aria-label="Move poster down"><ArrowDownIcon className="h-4 w-4" /></button>
                  <button type="button" onClick={() => toggleMovie(movieKey(movie))} className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white" aria-label="Remove poster"><XIcon className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-400">
              {selectedIds.length}/{MAX_HERO_MOVIES} posters selected
              {isManualIncomplete && <span className="ml-2 text-amber-300">Manual mode needs exactly five.</span>}
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isManualIncomplete}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SaveIcon className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save posters'}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold">Movie poster library</h2>
              <p className="text-sm text-gray-400">
                {filteredMovies.length} of {availableMovies.length} movies in the cinema catalog.
              </p>
            </div>
            <label className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-gray-300 sm:w-72">
              <SearchIcon className="h-4 w-4 shrink-0" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search movie" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-500" />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {filteredMovies.map((movie) => {
              const id = movieKey(movie);
              const isSelected = selectedIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleMovie(id)}
                  aria-pressed={isSelected}
                  className={`relative overflow-hidden rounded-lg border bg-black/30 text-left transition-all duration-200 hover:-translate-y-0.5 ${isSelected ? 'border-primary shadow-lg shadow-primary/20' : 'border-white/10 hover:border-primary/50'}`}
                >
                  <img src={getImageUrl(movie.poster_path || movie.backdrop_path)} alt={movie.title || movie.name} loading="lazy" decoding="async" className="aspect-2/3 w-full bg-black/40 object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black via-black/80 to-transparent p-2 pt-8">
                    <p className="truncate text-sm font-medium">{movie.title || movie.name}</p>
                    <p className="text-xs text-gray-400">{movie.release_date?.slice(0, 4) || 'N/A'}</p>
                  </div>
                  {isSelected && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white"><CheckIcon className="h-4 w-4" /></span>}
                </button>
              );
            })}
          </div>

          {!filteredMovies.length && (
            <p className="mt-4 rounded-lg border border-dashed border-white/15 px-6 py-8 text-center text-sm text-gray-500">
              No movie matches “{searchTerm}”.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

export default HeroSettings;
