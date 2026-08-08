import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ImagePlusIcon, RotateCcwIcon, SaveIcon, SearchIcon, ShuffleIcon, SparklesIcon, XIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { useAppContext } from '../../context/AppContext';
import apiClient from '../../lib/apiClient';
import HeroVideoUploader from './HeroVideoUploader';

const MAX_HERO_MOVIES = 5;
const CATALOG_JOB_STORAGE_KEY = 'nitrocine_catalog_refresh_job';

const getImageUrl = (path, size = 'w342') => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const HeroPoolGrid = ({ movies, onUpdated }) => (
  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {movies.map((movie) => (
      <div
        key={movie._id || movie.id}
        className={`grid grid-cols-[52px_1fr] gap-3 rounded-lg border p-2 ${
          movie.active ? 'border-primary/70 bg-primary/10' : 'border-white/10 bg-black/20'
        }`}
      >
        <img
          src={getImageUrl(movie.poster_path || movie.backdrop_path)}
          alt={movie.title}
          loading="lazy"
          decoding="async"
          className="h-[74px] w-[52px] rounded object-cover bg-black/40"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{movie.title}</p>
            {movie.active && <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] uppercase">Active</span>}
          </div>
          <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">{movie.category}</p>
          <p className={`mt-1 text-xs ${movie.nativeVideoValid ? 'text-green-400' : 'text-amber-400'}`}>
            {movie.nativeVideoValid ? 'Verified native trailer' : (movie.nativeVideoIssues || []).join(', ') || 'Trailer missing'}
          </p>
          <HeroVideoUploader movie={movie} onUpdated={onUpdated} />
        </div>
      </div>
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
  const [liveMeta, setLiveMeta] = useState(null);
  const [invalidMoviesError, setInvalidMoviesError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [availableMovies, setAvailableMovies] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [rotation, setRotation] = useState(null);
  const [soundDefaultEnabled, setSoundDefaultEnabled] = useState(false);
  const [defaultVolume, setDefaultVolume] = useState(0.35);
  const [savingSound, setSavingSound] = useState(false);
  const [refreshingHero, setRefreshingHero] = useState(false);
  const [syncingNowPlaying, setSyncingNowPlaying] = useState(false);
  
  const [dryRun, setDryRun] = useState(false);
  const [refreshingCatalog, setRefreshingCatalog] = useState(() => Boolean(sessionStorage.getItem(CATALOG_JOB_STORAGE_KEY)));
  const [refreshStatus, setRefreshStatus] = useState('');
  const [catalogJobId, setCatalogJobId] = useState(() => sessionStorage.getItem(CATALOG_JOB_STORAGE_KEY) || '');
  const terminalToastRef = useRef('');

  const handleRandomize = async () => {
    try {
      setRandomizing(true);
      const { data } = await apiClient.post('/api/admin/hero/randomize');
      if (!data.success) {
        toast.error(data.message || 'Unable to randomize hero.');
        return;
      }
      toast.success('The active five were reselected from the current 15-movie pool.');
      await fetchHeroSettings();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to randomize hero.');
    } finally {
      setRandomizing(false);
    }
  };

  const handleHeroRefresh = async () => {
    try {
      setRefreshingHero(true);
      const idempotencyKey = `admin-${new Date().toISOString().slice(0, 16).replace(/[^0-9]/g, '')}`;
      const { data } = await apiClient.post('/api/admin/hero/refresh', { idempotencyKey });
      if (!data.success) throw new Error(data.message || 'Hero refresh failed.');
      if (data.result?.skipped) {
        toast.success(`Hero refresh was idempotent (${data.result.reason}).`);
      } else {
        toast.success(`Hero batch v${data.result?.version ?? 'new'} activated.`);
      }
      await fetchHeroSettings();
    } catch (error) {
      const details = error.response?.data?.details;
      const missingCount = details?.missingOrInvalid?.length;
      toast.error(missingCount
        ? `${error.response?.data?.message || 'Hero refresh failed.'} ${missingCount} catalog movies are missing or invalid.`
        : error.response?.data?.message || error.message || 'Hero refresh failed.');
      await fetchHeroSettings();
    } finally {
      setRefreshingHero(false);
    }
  };

  const handleNowPlayingSync = async () => {
    try {
      setSyncingNowPlaying(true);
      const { data } = await apiClient.post('/api/show/sync-now-playing');
      if (!data.success) throw new Error(data.message || 'Now Showing sync failed.');
      const summary = data.summary || {};
      toast.success(`Now Showing synced: ${summary.scheduledMovies ?? 0} scheduled, ${summary.showsCreated ?? 0} created.`);
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Now Showing sync failed.');
    } finally {
      setSyncingNowPlaying(false);
    }
  };

  const handleSaveSound = async () => {
    try {
      setSavingSound(true);
      const { data } = await apiClient.put('/api/admin/hero/sound', {
        heroSoundDefaultEnabled: soundDefaultEnabled,
        heroDefaultVolume: Number(defaultVolume),
      });
      if (!data.success) throw new Error(data.message || 'Unable to save sound settings.');
      setSoundDefaultEnabled(Boolean(data.settings?.heroSoundDefaultEnabled));
      setDefaultVolume(Number(data.settings?.heroDefaultVolume ?? defaultVolume));
      toast.success('Hero sound defaults saved.');
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to save sound settings.');
    } finally {
      setSavingSound(false);
    }
  };

  const handleCatalogRefresh = async () => {
    try {
      setRefreshingCatalog(true);
      setRefreshStatus('Queueing...');
      const { data } = await apiClient.post('/api/admin/catalog/refresh', { dryRun });
      if (!data.success || !data.jobId) throw new Error(data.message || 'Catalog refresh was not queued.');
      sessionStorage.setItem(CATALOG_JOB_STORAGE_KEY, data.jobId);
      terminalToastRef.current = '';
      setCatalogJobId(data.jobId);
      setRefreshStatus('Queued');
    } catch (error) {
      setRefreshStatus('Failed');
      toast.error(error.response?.data?.message || error.message || 'Catalog refresh failed.');
      setRefreshingCatalog(false);
    }
  };

  useEffect(() => {
    if (!catalogJobId) return undefined;
    let active = true;
    let timer;
    const poll = async () => {
      try {
        const { data } = await apiClient.get(`/api/admin/catalog/refresh/${encodeURIComponent(catalogJobId)}`);
        if (!active || !data.success) return;
        const job = data.job;
        const terminal = job.status === 'succeeded' || job.status === 'failed';
        setRefreshingCatalog(!terminal);
        setRefreshStatus(job.status === 'running'
          ? `Running: ${job.currentPhase}`
          : job.status.charAt(0).toUpperCase() + job.status.slice(1));
        if (terminal) {
          sessionStorage.removeItem(CATALOG_JOB_STORAGE_KEY);
          if (terminalToastRef.current !== `${catalogJobId}:${job.status}`) {
            terminalToastRef.current = `${catalogJobId}:${job.status}`;
            if (job.status === 'succeeded') {
              toast.success(job.dryRun
                ? `Dry run validated ${job.metrics?.detailsFetched || 150} movies.`
                : `Catalog v${job.targetVersion} activated.`);
            } else {
              toast.error(job.errorMessage || job.errorCode || 'Catalog refresh failed.');
            }
          }
          setCatalogJobId('');
          return;
        }
        timer = window.setTimeout(poll, 2000);
      } catch (error) {
        if (!active) return;
        setRefreshingCatalog(false);
        setRefreshStatus('Status unavailable');
        toast.error(error.response?.data?.message || 'Unable to read catalog refresh status.');
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [catalogJobId]);

  const movieById = useMemo(() => {
    return new Map(availableMovies.map((movie) => [String(movie._id || movie.id), movie]));
  }, [availableMovies]);

  const selectedMovies = useMemo(() => {
    return selectedIds.map((id) => movieById.get(String(id))).filter(Boolean);
  }, [movieById, selectedIds]);

  const filteredMovies = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return availableMovies;
    return availableMovies.filter((movie) => movie.title?.toLowerCase().includes(query));
  }, [availableMovies, searchTerm]);

  const fetchHeroSettings = async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get('/api/admin/hero');
      if (!data.success) {
        toast.error(data.message || 'Unable to load hero settings.');
        return;
      }

      const hero = data.hero || {};
      const nextRotation = hero.rotation || null;
      const combinedMovies = [
        ...(hero.liveMovies || []),
        ...(hero.manualSelection?.movies || hero.selectedMovies || []),
        ...(nextRotation?.pool || []),
        ...(hero.availableMovies || []),
      ];
      const uniqueMovies = [...new Map(
        combinedMovies.map((movie) => [String(movie._id || movie.id), movie]),
      ).values()];
      setRotation(nextRotation);
      setLiveMovies(hero.liveMovies || []);
      setLiveMeta(hero.meta || null);
      setMode(hero.settings?.mode || 'auto');
      const savedMovieIds = hero.settings?.movieIds?.length
        ? hero.settings.movieIds
        : (hero.manualSelection?.movieIds || (hero.manualSelection?.movies || []).map((movie) => String(movie._id || movie.id)));
      setSelectedIds((savedMovieIds || []).map(String));
      setAvailableMovies(uniqueMovies);
      setSoundDefaultEnabled(Boolean(hero.settings?.heroSoundDefaultEnabled));
      setDefaultVolume(Number(hero.settings?.heroDefaultVolume ?? 0.35));
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to load hero settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchHeroSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggleMovie = (movieId) => {
    const id = String(movieId);
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_HERO_MOVIES) {
        toast.error(`Choose up to ${MAX_HERO_MOVIES} hero movies.`);
        return current;
      }
      return [...current, id];
    });
  };

  const moveSelectedMovie = (index, direction) => {
    setSelectedIds((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (mode === 'manual' && selectedIds.length !== MAX_HERO_MOVIES) {
      toast.error(`Choose exactly ${MAX_HERO_MOVIES} movies for manual hero selection.`);
      return;
    }

    try {
      setSaving(true);
      setInvalidMoviesError(null);
      const { data } = await apiClient.put('/api/admin/hero', { mode, movieIds: selectedIds });
      if (!data.success) {
        toast.error(data.message || 'Unable to update hero.');
        return;
      }
      toast.success(data.message || 'Hero updated successfully.');
      setMode(data.settings?.configuredMode || data.settings?.mode || mode);
      setSelectedIds((data.settings?.movieIds || selectedIds).map(String));
      if (data.liveHero?.movies) {
        setLiveMovies(data.liveHero.movies);
      }
      if (data.meta) {
        setLiveMeta(data.meta);
      }
    } catch (error) {
      const resp = error.response?.data;
      if (error.response?.status === 422 && resp?.code === 'MANUAL_HERO_INVALID') {
        setInvalidMoviesError(resp.invalidMovies || []);
        const details = (resp.invalidMovies || [])
          .map((m) => `${m.title || m.movieId}: ${(m.reasons || []).join(', ')}`)
          .join('; ');
        toast.error(`Manual Selection Invalid: ${resp.message} (${details})`, { duration: 7000 });
      } else {
        toast.error(resp?.message || error.message || 'Unable to update hero.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading message="Loading hero settings..." />;

  const effectiveLiveMode = liveMeta?.effectiveMode || (mode === 'manual' ? 'manual' : 'auto');

  return (
    <div className="relative max-w-6xl">
      <Title text1="Hero " text2="Settings" />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-white/[0.04] border border-white/10 rounded-lg">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-sm uppercase tracking-widest text-gray-400">Home page hero</p>
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${effectiveLiveMode === 'manual' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-blue-500/20 text-blue-400 border-blue-500/40'}`}>
                Currently live on Home: {effectiveLiveMode === 'manual' ? 'Manual Selection' : 'Auto-Rotation'}
              </span>
            </div>
            <p className="text-gray-300 mt-1 text-sm">
              Manual mode displays your exact 5 manually selected movies in order on the Home page. Auto mode rotates movies using the native hero pool.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="grid grid-cols-2 gap-1 p-1 bg-black/30 border border-white/10 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('auto')}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm transition cursor-pointer ${mode === 'auto' ? 'bg-primary text-white font-medium' : 'text-gray-300 hover:bg-white/10'}`}
              >
                <SparklesIcon className="w-4 h-4" />
                Auto
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm transition cursor-pointer ${mode === 'manual' ? 'bg-primary text-white font-medium' : 'text-gray-300 hover:bg-white/10'}`}
              >
                <ImagePlusIcon className="w-4 h-4" />
                Manual
              </button>
            </div>

            <button
              type="button"
              onClick={handleRandomize}
              disabled={randomizing || saving}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 disabled:opacity-60 transition text-white text-sm cursor-pointer"
              title="Randomize Hero movies excluding any used in the last 2 days"
            >
              <ShuffleIcon className={`w-4 h-4 ${randomizing ? 'animate-spin' : ''}`} />
              {randomizing ? 'Randomizing' : 'Randomize'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || randomizing || (mode === 'manual' && selectedIds.length !== MAX_HERO_MOVIES)}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary hover:bg-primary-dull disabled:opacity-60 transition text-sm cursor-pointer"
            >
              <SaveIcon className="w-4 h-4" />
              {saving ? 'Saving' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleNowPlayingSync}
              disabled={syncingNowPlaying}
              className="rounded-md border border-white/15 bg-white/[0.06] px-4 py-2 text-sm transition hover:bg-white/[0.12] disabled:opacity-60 cursor-pointer shrink-0"
            >
              {syncingNowPlaying ? 'Syncing Now Showing…' : 'Sync Now Showing'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm uppercase tracking-widest text-gray-400">Default trailer sound</p>
            <p className="mt-1 text-sm text-gray-300">
              Audible autoplay remains browser-controlled. Visitors always receive a muted fallback and can grant consent.
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={soundDefaultEnabled}
                onChange={(event) => setSoundDefaultEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-black/30 text-primary focus:ring-0"
              />
              Attempt sound by default
            </label>
            <label className="mt-3 flex max-w-lg items-center gap-3 text-sm text-gray-300">
              Volume
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={defaultVolume}
                onChange={(event) => setDefaultVolume(Number(event.target.value))}
                className="min-w-0 flex-1"
                aria-label="Default Hero trailer volume"
              />
              <span className="w-12 text-right">{Math.round(defaultVolume * 100)}%</span>
            </label>
          </div>
          <button
            type="button"
            onClick={handleSaveSound}
            disabled={savingSound}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm transition hover:bg-primary-dull disabled:opacity-60 cursor-pointer"
          >
            <SaveIcon className="h-4 w-4" />
            {savingSound ? 'Saving' : 'Save sound'}
          </button>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-white">1. Currently Live on Home</h3>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${effectiveLiveMode === 'manual' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-blue-500/20 text-blue-400 border-blue-500/40'}`}>
                  Live Mode: {effectiveLiveMode === 'manual' ? 'Manual Selection' : 'Auto-Rotation'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                These movies are effectively live and rendered on the public Home page right now.
              </p>
            </div>
            {liveMeta?.source && (
              <span className="text-xs font-mono text-gray-400 bg-black/30 px-2.5 py-1 rounded border border-white/10">
                Source: {liveMeta.source}
              </span>
            )}
          </div>

          {liveMovies.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {liveMovies.map((movie, index) => (
                <div
                  key={movie._id || movie.id || index}
                  className="flex flex-col rounded-lg border border-white/10 bg-black/30 p-2 overflow-hidden"
                >
                  <div className="relative aspect-2/3 w-full rounded overflow-hidden bg-black/40">
                    <img
                      src={getImageUrl(movie.poster_path || movie.backdrop_path)}
                      alt={movie.title}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute top-1 left-1 flex items-center justify-center w-6 h-6 rounded bg-black/70 text-xs font-bold text-white border border-white/20">
                      {index + 1}
                    </span>
                  </div>
                  <div className="mt-2 min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{movie.title}</p>
                    <p className="text-xs text-gray-400">{movie.release_date?.slice(0, 4) || 'N/A'}</p>
                    <p className={`mt-1 text-[11px] ${movie.nativeVideoValid || movie.heroVideoStatus === 'ready' ? 'text-green-400' : 'text-amber-400'}`}>
                      {movie.nativeVideoValid || movie.heroVideoStatus === 'ready' ? '✓ Verified native trailer' : (movie.nativeVideoIssues || []).join(', ') || 'Trailer missing'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 p-4 text-center text-sm text-gray-400 border border-dashed border-white/10 rounded-lg">
              No live movies data loaded yet.
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-white">2. Manual Selection ({selectedMovies.length}/{MAX_HERO_MOVIES})</h3>
                {mode === 'manual' ? (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-500/20 text-green-400 border border-green-500/40">Manual Mode Selected</span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-500/20 text-gray-400 border border-white/10">Manual Inactive</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Manual mode displays your exact 5 selected movies in this exact order on Home. All 5 movies must have verified native video trailers.
              </p>
            </div>
          </div>

          {invalidMoviesError && invalidMoviesError.length > 0 && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
              <p className="font-semibold text-red-100 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-red-400"></span>
                Manual Selection Validation Failed (HTTP 422 MANUAL_HERO_INVALID):
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-red-300">
                {invalidMoviesError.map((item, idx) => (
                  <li key={idx}>
                    <span className="font-medium text-white">{item.title || item.movieId}</span>: {(item.reasons || []).join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid lg:grid-cols-[360px_1fr] gap-6">
            <div className="flex flex-col gap-3">
              <p className="text-xs uppercase tracking-wider text-gray-400 font-medium">Reorderable Selection (1-5)</p>
              {selectedMovies.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-white/15 text-center text-sm text-gray-500">
                  No movies selected yet. Click movies from the library to add them.
                </div>
              ) : (
                selectedMovies.map((movie, index) => {
                  const isVerified = movie.nativeVideoValid || movie.heroVideoStatus === 'ready';
                  return (
                    <div
                      key={movie._id || movie.id}
                      className={`flex flex-col gap-2 p-2 rounded-lg bg-black/30 border ${isVerified ? 'border-white/10' : 'border-amber-500/40'}`}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={getImageUrl(movie.poster_path || movie.backdrop_path)}
                          alt={movie.title}
                          loading="lazy"
                          decoding="async"
                          className="w-14 h-20 object-cover rounded-md bg-black/40"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{index + 1}. {movie.title}</p>
                          <p className="text-xs text-gray-500">{movie.release_date?.slice(0, 4) || 'N/A'}</p>
                          <p className={`mt-0.5 text-[11px] ${isVerified ? 'text-green-400' : 'text-amber-400'}`}>
                            {isVerified ? '✓ Verified native trailer' : (movie.nativeVideoIssues || []).join(', ') || 'Trailer missing/unverified'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveSelectedMovie(index, -1)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                            disabled={index === 0}
                            aria-label="Move movie up"
                          >
                            <ArrowUpIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSelectedMovie(index, 1)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                            disabled={index === selectedMovies.length - 1}
                            aria-label="Move movie down"
                          >
                            <ArrowDownIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleMovie(movie._id || movie.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"
                            aria-label="Remove movie"
                          >
                            <XIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <HeroVideoUploader movie={movie} onUpdated={fetchHeroSettings} />
                    </div>
                  );
                })
              )}
            </div>

            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-sm">Movie Library</p>
                  <p className="text-xs text-gray-400">Click a movie card to add or remove it from Manual Selection.</p>
                </div>
                <label className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/30 border border-white/10 text-gray-300 min-w-0 sm:w-64">
                  <SearchIcon className="w-4 h-4 shrink-0" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search movie"
                    className="w-full bg-transparent outline-none text-sm text-white placeholder:text-gray-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[520px] overflow-y-auto pr-1">
                {filteredMovies.map((movie) => {
                  const id = String(movie._id || movie.id);
                  const isSelected = selectedIds.includes(id);

                  return (
                    <div
                      key={id}
                      className={`overflow-hidden rounded-lg border transition bg-black/30 ${isSelected ? 'border-primary shadow-lg shadow-primary/20' : 'border-white/10 hover:border-primary/50'}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleMovie(id)}
                        aria-pressed={isSelected}
                        className="relative block w-full text-left cursor-pointer"
                      >
                        <img
                          src={getImageUrl(movie.poster_path || movie.backdrop_path)}
                          alt={movie.title}
                          loading="lazy"
                          decoding="async"
                          className="w-full aspect-2/3 object-cover bg-black/40"
                        />
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-linear-to-t from-black via-black/80 to-transparent">
                          <p className="text-sm font-medium truncate">{movie.title}</p>
                          <p className="text-xs text-gray-400">{movie.release_date?.slice(0, 4) || 'N/A'}</p>
                        </div>
                        {isSelected && (
                          <span className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-md bg-primary text-white">
                            <CheckIcon className="w-4 h-4" />
                          </span>
                        )}
                      </button>
                      <div className="border-t border-white/10 p-2">
                        <HeroVideoUploader movie={movie} onUpdated={fetchHeroSettings} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredMovies.length === 0 && (
                <div className="mt-4 min-h-40 flex items-center justify-center rounded-lg border border-dashed border-white/15 text-sm text-gray-500">
                  No movies match this search.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">3. Auto Rotation Pool</h3>
                {mode === 'auto' ? (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-500/20 text-green-400 border border-green-500/40">Currently Live on Home</span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-500/20 text-gray-400 border border-white/10">Auto-Rotation Inactive</span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-300">
                Builds 5 newest, 5 hot, and 5 discovery movies, then activates a seeded five-movie order.
              </p>
            </div>
            <button
              type="button"
              onClick={handleHeroRefresh}
              disabled={refreshingHero}
              className="rounded-md bg-primary px-4 py-2 text-sm transition hover:bg-primary-dull disabled:opacity-60 cursor-pointer shrink-0"
            >
              {refreshingHero ? 'Refreshing Hero…' : 'Refresh Hero pool'}
            </button>
          </div>

          {rotation?.activeBatch && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500">Batch</p>
                  <p className="mt-1 font-medium">v{rotation.activeBatch.version} · {rotation.activeBatch.batchKey}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500">Pool</p>
                  <p className="mt-1 font-medium">{rotation.activeBatch.movieCount}/15 · {rotation.activeBatch.activeMovieCount}/5 active</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500">Last refresh</p>
                  <p className="mt-1 text-sm">{
                    rotation.refreshState?.lastSuccessfulRefreshAt
                      ? new Date(rotation.refreshState.lastSuccessfulRefreshAt).toLocaleString()
                      : rotation.activeBatch.activatedAt
                        ? new Date(rotation.activeBatch.activatedAt).toLocaleString()
                        : 'Pending'
                  }</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500">Next refresh</p>
                  <p className="mt-1 text-sm">{
                    (rotation.refreshState?.nextRefreshAt || rotation.activeBatch.nextRefreshAt)
                      ? new Date(rotation.refreshState?.nextRefreshAt || rotation.activeBatch.nextRefreshAt).toLocaleString()
                      : 'Not scheduled'
                  }</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500">State</p>
                  <p className="mt-1 text-sm">{rotation.refreshState?.refreshing ? 'Refreshing' : 'Ready'}</p>
                </div>
              </div>

              <HeroPoolGrid movies={rotation.pool || []} onUpdated={fetchHeroSettings} />
            </div>
          )}

          {!rotation?.activeBatch && (rotation?.pool || []).length > 0 && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-amber-200">No active native Hero batch</p>
                  <p className="mt-1 text-sm text-amber-100/80">
                    Showing the pending {rotation.pool.length}-movie Hero candidate pool below. Upload and commit verified movie-specific trailers before refreshing.
                  </p>
                </div>
                <p className="text-sm text-amber-100">
                  {rotation.refreshState?.refreshing ? 'Refreshing' : 'Awaiting native assets'}
                </p>
              </div>
              <HeroPoolGrid movies={rotation.pool} onUpdated={fetchHeroSettings} />
            </div>
          )}

          {(rotation?.missingTrailers || []).length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="font-medium text-amber-200">
                {rotation.missingTrailers.length} movies need a verified, movie-specific native trailer
              </p>
              <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                {rotation.missingTrailers.map((movie) => (
                  <span key={movie._id || movie.id} className="rounded bg-black/30 px-2 py-1 text-xs text-amber-100">
                    {movie.title} · {(movie.nativeVideoIssues || []).join(', ') || 'missing'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-white/[0.04] border border-white/10 rounded-lg">
          <div>
            <p className="text-sm uppercase tracking-widest text-gray-400">Weekly Catalog Pool</p>
            <p className="text-gray-300 mt-1 text-sm">Manually trigger a weekly catalog refresh. This will rebuild the catalog pool from TMDB.</p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-white/10 bg-black/30 text-primary focus:ring-0 w-4 h-4"
              />
              Dry Run
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCatalogRefresh}
                disabled={refreshingCatalog}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary hover:bg-primary-dull disabled:opacity-60 transition text-sm cursor-pointer"
              >
                <RotateCcwIcon className={`w-4 h-4 ${refreshingCatalog ? 'animate-spin' : ''}`} />
                {refreshingCatalog ? 'Refreshing Catalog...' : 'Refresh Catalog'}
              </button>
              {refreshStatus && (
                <span className="text-xs text-gray-400">{refreshStatus}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroSettings;
