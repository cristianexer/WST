# Verification — 21 September 2026

## Automated checks

`npm test` passes all **112 tests across 12 files**. `npm run build` passes strict TypeScript and creates a static site of **671,112,301 bytes (640 MiB)**; the largest file is 28,312,028 bytes. Vite emits its non-fatal large-chunk warning for the rendering/model bundles.

The suite covers deterministic combat and replays, independent worker input streams and pause barriers, contact resolution, movement/attack buffering, fighter resource profiles, public AI observations, model prompt limits, recovery lifecycle and stale replies, sprite animation, audio/effects scheduling, and radio playback races.

Two regressions directly exercise the reported pull-toward-opponent symptom: held movement is not retained in the attack buffer after release/reversal, and a direction change plus attack crosses the worker boundary atomically. The latter was observed failing with `[light, advance, advance]` before the fix and passing with `[light, retreat, retreat]` after it. Attack knockback remains intentional; walking into an idle fighter does not shove them.

A second reported no-hit dragging symptom was reproduced in the actual `ArenaRenderer.render()` camera path with GPU output stubbed. With player world x fixed at -2, an approaching AI moved the player's projected screen coordinate from -0.4806 to -0.0841. Pursuit also made leftward retreat appear rightward. The camera had tracked the fighters' midpoint and distance against an immobile background. Framing now anchors to the full arena instead; three tests verify idle-player screen stability, visible retreat direction and both walls remaining in frame. The production build was visually checked with active combat after this change.

Replay format and storage are **v5**. Older balance versions are excluded; selected profiles, signatures and every applied worker input reconstruct the exact simulation.

## Roster and balance

All 21 fighters have distinct five-stat builds, each totaling 500 with individual values from 85 to 115. Power and vitality trade off directly. Stats affect damage, movement speed, maximum health/stamina and stamina regeneration. Every fighter retains one fixed signature with individual mechanics, animation and sound.

`tools/balance/audit.ts` runs all pairs with both sides swapped, using delayed public-state controllers over bounded 12-second exchanges. The resulting [audit data](balance-audit.json) contains 40 exchanges per fighter in each scenario. Ordinary-move win shares span 27.5–57.5%; character-signature shares span 30–80% (19 of 21 between 30 and 71.3%). Lula remains the largest high outlier in this harness. This is a deterministic diagnostic, not proof of human or competitive balance.

Reproduce with:

```sh
node_modules/.bin/esbuild tools/balance/audit.ts --bundle --platform=node --format=esm --outfile=/tmp/wst-balance-audit.mjs
node /tmp/wst-balance-audit.mjs
```

## Artwork, UI and audio

There are exactly 63 final fighter sheets: three eight-pose sheets per leader, 504 generated poses total. Earlier alpha-component inspection covered all silhouettes; 48 overlapping atlas rectangles use strip meshes that exclude neighboring artwork without altering generated PNG pixels. Selected-pair art and shaders preload before the opening bell.

Browser checks covered independent player/AI selection including mirror matches, visible actual stat values, W jump controls, and desktop/mobile layouts at 1440 and 390 pixels. The generated WST mark is mounted in the header, favicon, touch icon and social metadata. The canonical URL and sitemap target the GitHub Pages project path.

All 12 recorded Kenney CC0 foley samples load. The radio's three licensed guitar/bass/drum recordings decoded and played in the browser: Big Rock (230.948 s), Cool Rock (209.379 s), and Hotrock (204.722 s). Station changes, independent volume, global mute, pause and local-file playback were exercised. Your Track creates a local object URL and does not upload the file. Music is not included in captured fight clips; the shared effects mix is.

Earlier browser samples on this desktop measured renderer p95 frame intervals of 7.5–10.1 ms while genuine Laya inference ran in its own worker. These measurements are host-specific. A VP9/Opus fight clip recorded successfully. Touch controls and mobile GPU support remain experimental.

## Laya and deployment-path checks

The custom-domain CDN served the first model chunk with gzip `Content-Length: 14345624`, while the decoded manifest size is 25165824. The original loader incorrectly rejected the compressed transport length before reading the body. New load-path tests first reproduced that exact error for gzip/Brotli, then passed after switching to decoded-body validation. Six transport cases cover gzip, Brotli, identity/missing metadata, truncation, same-size corruption and oversized-stream cancellation. Size and SHA-256 verification remain mandatory.


The full pinned Laya graph is genuine client-side WebGPU inference. Baseline practice is separately labelled; the hybrid opponent clearly distinguishes Laya advice from local combat choices. The root checkpoint remains passive and position-sensitive in choice probes, so WST does not claim that it is a trained fighting policy. See [runtime details and parity measurements](LAYA_BROWSER.md).

The production build is tested through a plain HTTP server beneath `/WST/`, including model chunks, runtime workers, artwork and audio. A real finite warm-up must finish before Laya selection opens. No server API or secret is required.

A production browser fault test withheld the first model request after genuine initialization. At **30.003 seconds**, WST replaced the inference worker. The combat worker emitted **120 frames in the two seconds around recovery**, with a maximum batch gap of 22 ms and no pause command. The replacement then returned **15 genuine decisions** before the match ended normally. The AI used advance, low, heavy, overhead, body and guard actions while the initial model reply was unavailable. Browser console: **zero errors and zero warnings**.

A subsequent live reversal plus light-attack input produced 44 retreat-input frames; after the attack recovery, the player moved away from the active AI from x=-2.056 to x=-2.5373 with unchanged HP during that interval. The held direction did not revert to advance.

This record covers local verification and targeted browser checks, not broad browser or performance certification.
