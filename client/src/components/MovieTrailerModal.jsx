import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Film, Play, RefreshCw, Ticket, X } from 'lucide-react';
import { fetchHomeTrailers } from '../services/tmdb';

const YOUTUBE_EMBED_BASE = 'https://www.youtube-nocookie.com/embed';

const tmdbImage = (path, size) => {
  const value = String(path || '').trim();
  if (!value) return '';
  return value.startsWith('http') ? value : `https://image.tmdb.org/t/p/${size}${value}`;
};

const buildEmbedUrl = (key) => {
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    // Opening the preview and pressing play are both real clicks, so the browser
    // allows sound-on autoplay here without the muted fallback the Home rail needs.
    autoplay: '1',
  });
  return `${YOUTUBE_EMBED_BASE}/${key}?${params.toString()}`;
};

// The Home trailer rail reads its candidates from HomeDataProvider, which only
// exists on Home. On Movie Details it waited forever for that data, so this
// preview asks for exactly one movie's trailer instead.
const MovieTrailerModal = ({ movie, open, onClose, onBuyTickets }) => {
  const movieId = String(movie?._id || movie?.id || '').trim();
  const title = movie?.title || movie?.name || 'Movie';
  const closeRef = useRef(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [request, setRequest] = useState({ key: '', status: 'idle', trailer: null });
  // Tied to the request it started from, so closing the dialog by any route (or
  // opening it for another movie) always lands back on the preview.
  const [playingFor, setPlayingFor] = useState('');
  const requestKey = `${movieId}:${reloadToken}`;

  useEffect(() => {
    if (!open || !movieId) return undefined;
    const controller = new AbortController();
    fetchHomeTrailers({ movieIds: [movieId], signal: controller.signal })
      .then(({ trailers }) => {
        if (controller.signal.aborted) return;
        const trailer = trailers.find((entry) => entry.movieId === movieId) || null;
        // A failed lookup is not proof the movie has no trailer, so it keeps
        // the retry path instead of saying "no trailer".
        let status = 'unavailable';
        if (trailer?.available) status = 'ready';
        else if (!trailer || trailer.status === 'error') status = 'error';
        setRequest({ key: requestKey, status, trailer });
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        console.error('[MovieTrailerModal] trailer lookup failed:', error?.message || error);
        setRequest({ key: requestKey, status: 'error', trailer: null });
      });
    return () => controller.abort();
  }, [movieId, open, requestKey]);

  const close = useCallback(() => {
    setPlayingFor('');
    onClose?.();
  }, [onClose]);

  // Escape to close, background scroll locked, focus handed back on close.
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [close, open]);

  if (!open || !movie) return null;

  // A stale result from a previous movie or retry still reads as loading.
  const status = request.key === requestKey ? request.status : 'loading';
  const trailer = status === 'ready' ? request.trailer : null;
  const playing = Boolean(trailer) && playingFor === requestKey;
  const backdrop = tmdbImage(movie.backdrop_path, 'w1280') || tmdbImage(movie.poster_path, 'w780');
  const art = backdrop || trailer?.thumbnailUrl || '';
  const year = movie.release_date ? String(movie.release_date).split('-')[0] : '';
  const genres = Array.isArray(movie.genres) ? movie.genres.slice(0, 3).map((genre) => genre.name).filter(Boolean) : [];

  // Portalled to <body>: the details page is an `isolate` stacking context, which
  // would otherwise keep the dialog underneath the fixed navbar.
  return createPortal((
    <div
      className="trailer-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trailer-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="trailer-modal__panel">
        <header className="trailer-modal__header">
          <div className="min-w-0">
            <p className="trailer-modal__eyebrow">
              {trailer ? `${trailer.official ? 'Official ' : ''}${trailer.type}` : 'Trailer'}
            </p>
            <h2 id="trailer-modal-title" className="trailer-modal__title">{title}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close trailer"
            className="trailer-glass-button shrink-0"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="trailer-modal__stage" aria-busy={status === 'loading'}>
          {playing ? (
            <iframe
              src={buildEmbedUrl(trailer.key)}
              title={`${title} ${trailer.name || 'trailer'}`}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <>
              {art && <img src={art} alt="" aria-hidden="true" className="trailer-modal__art" data-dim={status !== 'ready'} />}
              <span className="trailer-preview__scrim" aria-hidden="true" />

              {status === 'ready' && (
                <button
                  type="button"
                  onClick={() => setPlayingFor(requestKey)}
                  aria-label={`Play the ${title} trailer`}
                  className="trailer-preview trailer-preview--overlay"
                >
                  <span className="trailer-preview__play" aria-hidden="true">
                    <Play className="h-7 w-7 translate-x-0.5 fill-current" />
                  </span>
                </button>
              )}

              {status === 'loading' && (
                <div className="trailer-modal__state" role="status">
                  <span className="trailer-modal__pulse" aria-hidden="true" />
                  <p>Finding the trailer…</p>
                </div>
              )}

              {status === 'unavailable' && (
                <div className="trailer-modal__state" role="status">
                  <Film className="h-9 w-9 text-rose-400" aria-hidden="true" />
                  <p className="font-semibold text-white">No trailer for this movie yet</p>
                  <p className="text-sm text-gray-300">We could not find a verified trailer on YouTube.</p>
                </div>
              )}

              {status === 'error' && (
                <div className="trailer-modal__state" role="alert">
                  <Film className="h-9 w-9 text-amber-300" aria-hidden="true" />
                  <p className="font-semibold text-white">Trailer lookup is unavailable</p>
                  <button
                    type="button"
                    onClick={() => setReloadToken((value) => value + 1)}
                    className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Try again
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="trailer-modal__footer">
          <p className="min-w-0 truncate text-sm text-gray-400">
            {[year, ...genres].filter(Boolean).join(' • ')}
          </p>
          <button
            type="button"
            onClick={() => {
              close();
              onBuyTickets?.();
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dull"
          >
            <Ticket className="h-4 w-4" aria-hidden="true" />
            Buy Tickets
          </button>
        </footer>
      </div>
    </div>
  ), document.body);
};

export default MovieTrailerModal;
