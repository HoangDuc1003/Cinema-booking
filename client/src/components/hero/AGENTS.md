# Hero Component Invariants

## Fundamental invariant

The Home Hero has exactly two media outcomes:

1. one verified native HTML5 `<video>` for the active server-ordered movie;
2. that movie's poster while native playback is unavailable, deferred, or unverified.

YouTube iframe, YouTube Player API, ReactPlayer, TMDB video lookup, and generic
fallback footage are forbidden in the Hero flow. YouTube may remain in
non-Hero trailer surfaces.

## Native playback

- Resolve only server-provided `heroVideoStatus: "ready"` MP4/WebM sources.
- Production sources must use HTTPS. Development mock video is allowed only
  behind the explicit `?heroMock=1` development flag.
- Mount at most one active `<video>`. Never preload inactive movie media.
- Use `autoPlay`, `playsInline`, `preload="metadata"`, no `controls`,
  `disablePictureInPicture`, and a restrictive `controlsList`.
- Keep the poster visible until `play()` resolves, decoded dimensions are
  positive, and `currentTime` advances.
- Pause when the document or Hero is not visible. Resume only while playback
  remains eligible; never create an unbounded retry loop.
- On ended, media error, sustained stall, or non-advancing playback, show the
  poster and advance once to the next server-ordered movie.
- Clear timers, listeners, pending play attempts, and media resources on
  generation change or unmount.

## Audio

- Browser autoplay policy is authoritative.
- Honor `nitrocine:hero-audio-consent` and `nitrocine:hero-volume`.
- If audible autoplay is rejected, retry muted once and expose an accessible
  `Turn trailer sound on` control.
- Save enabled consent only after a user gesture successfully unmutes and
  playback remains active.
- Do not add a pause control. Clicking the video must not pause it.

## Ordering and loading

- Preserve the first five movies exactly as returned by `/api/show/hero`.
- Do not score, shuffle, or select a client-side offset.
- Cache only the five-movie response with schema version, batch/version, and
  timestamp; never cache video blobs.
- Render cached poster content immediately and revalidate in the background.
- Respect reduced motion, save-data, slow connections, tab visibility, and
  viewport visibility.

## Required evidence

- zero Hero iframe, YouTube request, and TMDB video request;
- exactly one native video for the active movie;
- `play()` resolves and `currentTime` advances;
- positive decoded video dimensions;
- no native controls or pause button;
- bounded failure handoff and correct ended handoff;
- sound consent and `NotAllowedError` muted fallback;
- no initial request fan-out to all five video assets.

Runtime media tests must use a playable MP4/WebM. Do not fake success by
hanging a media request or by manually adding production CSS classes.
