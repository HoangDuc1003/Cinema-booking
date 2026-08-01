import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ImagePlusIcon, RotateCcwIcon, SaveIcon, SearchIcon, ShuffleIcon, SparklesIcon, XIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { useAppContext } from '../../context/AppContext';
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
  const { axios, user } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [randomizing, setRandomizing] = useState(false);
  const [mode, setMode] = useState('auto');
  const [selectedIds, setSelectedIds] = useState([]);
  const [availableMovies, setAvailableMovies] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [rotation, setRotation] = useState(null);
  const [soundDefaultEnabled, setSoundDefaultEnabled] = useState(false);
  const [defaultVolume, setDefaultVolume] = useState(0.35);
  const [savingSound, setSavingSound] = useState(false);
  const [refreshingHero, setRefreshingHero] = useState(false);
  
  const [dryRun, setDryRun] = useState(false);
  const [refreshingCatalog, setRefreshingCatalog] = useState(() => Boolean(sessionStorage.getItem(CATALOG_JOB_STORAGE_KEY)));
  const [refreshStatus, setRefreshStatus] = useState('');
  const [catalogJobId, setCatalogJobId] = useState(() => sessionStorage.getItem(CATALOG_JOB_STORAGE_KEY) || '');
  const terminalToastRef = useRef('');

  const handleRandomize = async () => {
    try {
      setRandomizing(true);
      const { data } = await axios.post('/api/admin/hero/randomize');
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
      const { data } = await axios.post('/api/admin/hero/refresh', { idempotencyKey });
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

  const handleSaveSound = async () => {
    try {
      setSavingSound(true);
      const { data } = await axios.put('/api/admin/hero/sound', {
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
      const { data } = await axios.post('/api/admin/catalog/refresh', { dryRun });
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
        const { data } = await axios.get(`/api/admin/catalog/refresh/${encodeURIComponent(catalogJobId)}`);
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
  }, [axios, catalogJobId]);


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
      const { data } = await axios.get('/api/admin/hero');
      if (!data.success) {
        toast.error(data.message || 'Unable to load hero settings.');
        return;
      }

      const hero = data.hero || {};
      const nextRotation = hero.rotation || null;
      const activeMovies = nextRotation?.activeMovies || [];
      const combinedMovies = [
        ...(nextRotation?.pool || []),
        ...(hero.availableMovies || []),
      ];
      const uniqueMovies = [...new Map(
        combinedMovies.map((movie) => [String(movie._id || movie.id), movie]),
      ).values()];
      setRotation(nextRotation);
      setMode(hero.settings?.mode || 'auto');
      setSelectedIds((
        activeMovies.length ? activeMovies : hero.selectedMovies || []
      ).map((movie) => String(movie._id || movie.id)));
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
      toast.error(`Choose exactly ${MAX_HERO_MOVIES} movies for the emergency poster fallback.`);
      return;
    }

    try {
      setSaving(true);
      const { data } = await axios.put('/api/admin/hero', { mode, movieIds: selectedIds });
      if (!data.success) {
        toast.error(data.message || 'Unable to update hero.');
        return;
      }
      toast.success(data.message || 'Hero updated successfully.');
      setMode(data.settings?.mode || mode);
      setSelectedIds((data.settings?.movieIds || selectedIds).map(String));
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to update hero.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading message="Loading hero settings..." />;

  return (
    <div className="relative max-w-6xl">
      <Title text1="Hero " text2="Settings" />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-white/[0.04] border border-white/10 rounded-lg">
          <div>
            <p className="text-sm uppercase tracking-widest text-gray-400">Home page hero</p>
            <p className="text-gray-300 mt-1">
              An active 15-movie rotation is authoritative. Manual mode only defines the ordered emergency poster fallback.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="grid grid-cols-2 gap-1 p-1 bg-black/30 border border-white/10 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('auto')}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm transition ${mode === 'auto' ? 'bg-primary text-white' : 'text-gray-300 hover:bg-white/10'}`}
              >
                <SparklesIcon className="w-4 h-4" />
                Auto
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm transition ${mode === 'manual' ? 'bg-primary text-white' : 'text-gray-300 hover:bg-white/10'}`}
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
              disabled={saving || randomizing}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary hover:bg-primary-dull disabled:opacity-60 transition text-sm cursor-pointer"
            >
              <SaveIcon className="w-4 h-4" />
              {saving ? 'Saving' : 'Save'}
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
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm transition hover:bg-primary-dull disabled:opacity-60"
          >
            <SaveIcon className="h-4 w-4" />
            {savingSound ? 'Saving' : 'Save sound'}
          </button>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm uppercase tracking-widest text-gray-400">Native Hero pool</p>
            <p className="mt-1 text-gray-300">
              Build 5 newest, 5 hot, and 5 discovery movies, then activate a seeded five-movie order.
            </p>
          </div>
          <button
            type="button"
            onClick={handleHeroRefresh}
            disabled={refreshingHero}
            className="rounded-md bg-primary px-4 py-2 text-sm transition hover:bg-primary-dull disabled:opacity-60"
          >
            {refreshingHero ? 'Refreshing Hero…' : 'Refresh Hero pool'}
          </button>
        </div>

        {rotation?.activeBatch && (
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
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
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
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

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-white/[0.04] border border-white/10 rounded-lg">
          <div>
            <p className="text-sm uppercase tracking-widest text-gray-400">Weekly Catalog Pool</p>
            <p className="text-gray-300 mt-1">Manually trigger a weekly catalog refresh. This will rebuild the catalog pool from TMDB.</p>
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
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary hover:bg-primary-dull disabled:opacity-60 transition"
              >
                {refreshingCatalog ? 'Refreshing...' : 'Refresh Catalog'}
              </button>

              {refreshStatus && (
                <span className={`text-sm font-medium ${
                  refreshStatus === 'Succeeded' ? 'text-green-500' :
                  refreshStatus === 'Failed' ? 'text-red-500' :
                  'text-gray-400'
                }`}>
                  {refreshStatus}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[360px_1fr] gap-6">
          <div className="bg-white/[0.04] border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Selected Hero</p>
                <p className="text-sm text-gray-400">{selectedIds.length}/{MAX_HERO_MOVIES} movies</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="p-2 rounded-md border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition"
                aria-label="Clear selected hero movies"
              >
                <RotateCcwIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {selectedMovies.length === 0 ? (
                <div className="min-h-36 flex items-center justify-center rounded-lg border border-dashed border-white/15 text-sm text-gray-500 text-center px-6">
                  Pick movies from the library to build a manual hero.
                </div>
              ) : selectedMovies.map((movie, index) => (
                <div key={movie._id || movie.id} className="grid grid-cols-[56px_1fr_auto] gap-3 items-center p-2 bg-black/25 border border-white/10 rounded-lg">
                  <img
                    src={getImageUrl(movie.poster_path || movie.backdrop_path)}
                    alt={movie.title}
                    loading="lazy"
                    decoding="async"
                    className="w-14 h-20 object-cover rounded-md bg-black/40"
                  />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{index + 1}. {movie.title}</p>
                    <p className="text-xs text-gray-500">{movie.release_date?.slice(0, 4) || 'N/A'}</p>
                    <HeroVideoUploader movie={movie} onUpdated={fetchHeroSettings} />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveSelectedMovie(index, -1)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
                      disabled={index === 0}
                      aria-label="Move movie up"
                    >
                      <ArrowUpIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSelectedMovie(index, 1)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
                      disabled={index === selectedMovies.length - 1}
                      aria-label="Move movie down"
                    >
                      <ArrowDownIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMovie(movie._id || movie.id)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10"
                      aria-label="Remove movie"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/[0.04] border border-white/10 rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Movie Library</p>
                <p className="text-sm text-gray-400">Showing movies already imported through shows.</p>
              </div>
              <label className="flex items-center gap-2 px-3 py-2 rounded-md bg-black/30 border border-white/10 text-gray-300 min-w-0 sm:w-72">
                <SearchIcon className="w-4 h-4 shrink-0" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search movie"
                  className="w-full bg-transparent outline-none text-sm text-white placeholder:text-gray-500"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
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
                      className="relative block w-full text-left"
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
    </div>
  );
};

export default HeroSettings;
