# Hero Component Invariants

## Poster-only Hero

The Home Hero renders posters only. It must never mount or request a Hero
trailer, iframe, player API, video asset, or generic fallback footage.

- Render one image for the active server-ordered movie and retain a poster
  fallback when the preferred image cannot load.
- Keep exactly five movies from `/api/show/hero` in the received order.
- The server chooses the automatic set by the Vietnam calendar day; the client
  revalidates at the next Vietnam midnight without reshuffling it locally.
- Keep the five-poster rail keyboard accessible. Do not preload video or
  inactive poster media eagerly.
- Respect reduced motion: do not auto-advance the poster carousel.

## Admin

- Manual mode requires exactly five distinct existing movies in the saved
  order.
- Auto mode uses the server's daily five-poster rotation.
- Do not reintroduce Hero video upload, sound, ingestion, or trailer controls.

## Required evidence

- no Hero video element, iframe, YouTube request, or trailer endpoint;
- exactly five poster records from the public Hero API;
- automatic selection changes with the Vietnam calendar date when more than
  five candidates are available;
- manual selections retain their exact saved order.
