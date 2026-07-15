import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ImagePlusIcon, RotateCcwIcon, SaveIcon, SearchIcon, SparklesIcon, XIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { useAppContext } from '../../context/AppContext';
import HeroVideoUploader from './HeroVideoUploader';

const MAX_HERO_MOVIES = 5;

const getImageUrl = (path, size = 'w342') => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const HeroSettings = () => {
  const { axios, user } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('auto');
  const [selectedIds, setSelectedIds] = useState([]);
  const [availableMovies, setAvailableMovies] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [dryRun, setDryRun] = useState(false);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState('');

  const handleCatalogRefresh = async () => {
    try {
      setRefreshingCatalog(true);
      setRefreshStatus('Refreshing...');
      const { data } = await axios.post('/api/admin/catalog/refresh', { dryRun });
      if (data.success) {
        setRefreshStatus('Success');
        toast.success(data.dryRun ? 'Dry run completed successfully.' : 'Catalog refreshed successfully.');
      } else {
        setRefreshStatus('Failed');
        toast.error(data.message || 'Catalog refresh failed.');
      }
    } catch (error) {
      setRefreshStatus('Failed');
      toast.error(error.response?.data?.message || error.message || 'Catalog refresh failed.');
    } finally {
      setRefreshingCatalog(false);
    }
  };


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
      setMode(hero.settings?.mode || 'auto');
      setSelectedIds((hero.settings?.movieIds || []).map(String));
      setAvailableMovies(hero.availableMovies || []);
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to load hero settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (mode === 'manual' && selectedIds.length === 0) {
      toast.error('Choose at least one movie for manual hero mode.');
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
            <p className="text-gray-300 mt-1">Manual mode displays the selected movies in this exact order.</p>
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
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary hover:bg-primary-dull disabled:opacity-60 transition"
            >
              <SaveIcon className="w-4 h-4" />
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>

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
                  refreshStatus === 'Success' ? 'text-green-500' :
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
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleMovie(id)}
                    className={`relative text-left rounded-lg overflow-hidden border transition bg-black/30 ${isSelected ? 'border-primary shadow-lg shadow-primary/20' : 'border-white/10 hover:border-primary/50'}`}
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
                      <div onClick={(e) => e.stopPropagation()}>
                        <HeroVideoUploader movie={movie} onUpdated={fetchHeroSettings} />
                      </div>
                    </div>
                    {isSelected && (
                      <span className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-md bg-primary text-white">
                        <CheckIcon className="w-4 h-4" />
                      </span>
                    )}
                  </button>
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
