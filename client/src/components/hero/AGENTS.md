# Hero Component Invariants

## Fundamental invariant
The Hero background has exactly two valid outcomes:

1. an active, verified YouTube IFrame Player trailer;
2. a poster with a manual play CTA when the player cannot start.

## YouTube curtain reveal
- The only embedded provider is YouTube through the IFrame Player API.
- Only the active movie may load a trailer or mount an iframe.
- Start playback muted behind a closed cinematic curtain.
- Keep the iframe transparent until the curtain has fully opened.
- Unmute only after the curtain clears, ramping volume from 0 to 60 over 800ms.
- The curtain is the sole loading-artifact mask; do not add center-button masks.
- Reveal only after a real `PLAYING` state and advancing `currentTime`.
- On player or script failure, retain the poster and expose the manual play CTA.
- Destroy the player and clear all timers/intervals when the movie changes or the Hero unmounts.

## Forbidden in Hero
- Native MP4/WebM background playback
- Vimeo or arbitrary iframe providers
- client-side movie reordering
- inactive movie video preloading
- direct DOM mutation outside the player wrapper

## Ordering
Preserve server order:

```js
const orderedMovies = rawMovies.slice(0, HERO_MAX_MOVIES);
```

Do not apply client scoring to a successful server response.

## Required E2E evidence
For an active desktop trailer:
- Hero has one YouTube iframe and no native video;
- five server-ordered movies render as five persistent thumbnail controls while only the active movie owns an iframe;
- the curtain starts closed, opens with the weighted transform animation, then leaves the DOM;
- the iframe is transparent until the curtain reaches `open`;
- `currentTime` advances before reveal;
- volume reaches 60 only after the 800ms post-curtain fade.
- five seconds after the verified trailer is revealed, compact copy retains the title, genres, metadata, a two-line description preview, and the two primary CTAs;
- the close transition must animate through `is-compacting` before final layout removal; do not snap `top` or secondary controls away on its first frame;
- compact movie copy can expand again through pointer, keyboard focus, or title interaction without hiding the thumbnail rail.

For a player failure or blocked autoplay:
- the poster remains visible;
- the curtain does not uncover an unverified iframe;
- a manual trailer CTA remains available.

## Test integrity
- Use a deterministic YouTube Player test double or a real embeddable trailer.
- Runtime playback tests must prove the player's `currentTime` advances.
- Never add CSS classes manually to simulate application state.
- Never stall a media request and claim playback success.
- Do not weaken an invariant test to make implementation pass.
