---
name: hero-runtime-debug
description: >
  Debug Home Hero playback failures, visible YouTube controls, missing native
  video, poster masking, media loading, Cloudinary delivery, or Hero API
  fallback. Use when the Hero does not play, shows an iframe, displays a pause
  bezel, remains on poster, or behaves differently in production.
---

# Hero Runtime Debug

## Workflow

1. Read:
   - root `AGENTS.md`;
   - `client/AGENTS.md`;
   - `client/src/components/hero/AGENTS.md`;
   - latest changed Hero files.

2. Record the current HEAD and changed files.

3. Reproduce before editing:
   - inspect `/api/show/hero`;
   - inspect browser Network;
   - inspect Hero DOM;
   - record console errors;
   - inspect active movie fields.

4. Classify the failure:
   - API/CORS;
   - fallback data;
   - invalid native asset;
   - selection/order;
   - browser autoplay;
   - media decode/CORS;
   - state-machine generation;
   - visual reveal.

5. Do not modify code until the first failing boundary is identified.

6. Implement the smallest patch.

7. Verify with a real playable MP4:
   - zero Hero iframe;
   - zero YouTube request;
   - zero TMDB videos request;
   - one native video;
   - `readyState >= 2`;
   - `currentTime` advances;
   - poster transitions correctly;
   - video remains muted.

8. Report:
   - root cause;
   - files changed;
   - commands;
   - actual output;
   - runtime evidence;
   - remaining limitations.
