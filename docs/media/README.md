# README visuals

The README uses the existing WST identity and generated character portraits. These promotional layouts were rendered in a browser; no new likenesses or altered source artwork were introduced.

- `wst-banner.gif`: seamless six-second loop, 60 frames at 10 fps, 900 × 333. Cast transitions, a slow orbit and a light sweep; no flashing.
- `{trump,xi,meloni,modi,milei,kim}.png`: 372 × 480 portrait cards with each character's actual fixed signature name.
- Logo source: `apps/web/public/assets/brand/wst-brandmark.png`.
- Portrait source: `apps/web/public/assets/roster-atlas.png`.
- Background source: `apps/web/public/assets/summit-arena.png`.

The complete browser composition is in `tools/docs/readme-art.html`. Serve it beside `assets/` from the app's public directory and `fonts/` from `node_modules/@fontsource/barlow-condensed/files`. Call `renderFrame(t)` with `t` from 0 to 5.9 in 0.1-second increments and capture `#banner`. Reveal `#gallery` to capture the individual cards. Temporary previews and frames belong in the ignored `output/` directory.

GIF encoding uses FFmpeg with a 160-colour palette and ordered dithering. The generated game assets and third-party audio/model licences are documented separately in the adjacent asset, brand and audio notes.
