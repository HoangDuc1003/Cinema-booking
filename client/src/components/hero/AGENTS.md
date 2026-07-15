# Hero Component Invariants

## Fundamental invariant
The Hero background has exactly two valid outcomes:

1. ready native MP4/WebM;
2. poster.

There is no third outcome.

## Forbidden in Hero
- YouTube iframe
- Vimeo iframe
- `fetchMovieTrailers`
- TMDB videos API
- YouTube IFrame API
- `HeroYouTubeVideo`
- automatic unmute
- client-side movie reordering
- inactive movie video preloading
- arbitrary reveal delays

## Native eligibility
A native source is usable only when:
- `heroVideoStatus === "ready"`;
- MIME is `video/mp4` or `video/webm`;
- URL belongs to the trusted CDN;
- source is not YouTube, Vimeo, iframe, blob, or data URL.

Otherwise remain poster-only.

## Playback
- Automatic playback begins muted.
- Only explicit user interaction may unmute.
- Only the active movie may mount or request video.
- Raise the poster on pause, waiting, stalled, error, or source change.
- Reveal only after a real playing state and advancing `currentTime`.

## Ordering
Preserve server order:

```js
const orderedMovies = rawMovies.slice(0, HERO_MAX_MOVIES);
```

Do not apply client scoring to a successful server response.

## Required E2E evidence
For a native-ready desktop movie:
- Hero iframe count is zero.
- YouTube API request count is zero.
- TMDB videos request count is zero.
- Hero video count is one.
- `currentTime` advances.
- autoplay remains muted.

For a poster-only movie:
- iframe count is zero;
- video count is zero;
- poster remains visible;
- no automatic playback error.

## Test integrity
- Use a real playable MP4 fixture.
- Never add CSS classes manually to simulate application state.
- Never stall a media request and claim playback success.
- Do not weaken an invariant test to make implementation pass.
