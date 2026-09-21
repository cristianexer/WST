# WST — World Summit Tournament

A local-first, fictional arcade fighting game with a 21-person user-selected roster. React + TypeScript provide the menus; Three.js presents detailed rendered character sprites in a 2.5D arena; a dedicated Web Worker runs deterministic combat at 60 ticks/second while the main thread renders the arena. No account, API key, inference server, or runtime backend is required.

## Run locally

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The arrival screen explains GPU/memory use before model initialization. **Initialize hybrid Laya** loads the local model package; **Enter baseline practice** selects a separately labelled heuristic opponent. Model availability and loading failures are shown honestly. Laya runs in a separate inference worker with WebGPU; the full Q4 model download is about 413 MB. A real finite warm-up decision must complete before selection opens. The verified desktop browser completed worker warm-up in 550 ms (1.9 seconds including cached model loading); other hardware will vary.

```sh
npm test       # combat, input/replay and AI contract checks
npm run build # strict TypeScript check + static production build
npm run preview
```

Node 22 is recommended. `.npmrc` uses npm's legacy peer resolver to avoid a known resolver crash with the selected toolchain. The lockfile records exact installed versions.

## Play

Choose **Your fighter** or **AI fighter** above the roster, then click a portrait. Both assignments are independent and mirror matches are supported. Each of the 21 delegates has a distinct five-stat build: power, speed, vitality, stamina and stamina recovery. Every build spends the same 500-point budget, with each stat between 85 and 115; power and vitality trade off directly. These stats change actual damage, movement, health, stamina capacity and regeneration; ordinary move timings and reach remain shared. Each delegate also has one fixed signature with unique mechanics, animation and sound. Signatures follow the selected character; there is no move selector. The bounded, side-swapped matchup audit and its limits are recorded in [the verification notes](docs/VERIFICATION.md). Clean hits now earn 14 meter (previously 10), so eight clean hits fill the gauge; taking a hit earns 3 and making the opponent block earns 5. A signature still spends 100 meter. Matches are best of three, 60 seconds per round, with a bounded deciding round for draws. Training uses an idle dummy and no round clock.

Default keyboard: **A/D** move, **W** jump, **S** crouch, **J** light, **K** heavy, **Space** guard, **L** dash, **U** throw/break, **I** parry, **O** special. Down + J is body; down + K is low; forward + J is anti-air; forward + K is overhead. Escape pauses and C opens AI Cam. Bindings, volume, effects and quality are saved locally. Gamepad is supported; touch controls are experimental.

A match records every applied semantic input from the combat worker. Pause/resume use ordered worker barriers so ticks are not lost. Replay format v5 isolates the new movement, fighter stats and contact rules from earlier balance versions. The last five completed matches are retained locally; replay playback does not call the AI. Download replay JSON or use Record Clip to capture up to 60 seconds of video with the shared game audio mix and persistent fiction/controller labels. Video capture depends on browser MediaRecorder support.

## Project layout

```text
apps/web/src/
  ai/                  Browser Laya runtime, public-state combat director and baseline
  audio/               Layered Web Audio foley, 21 signature cues and capture mix
  components/          Selection, match/HUD, dialogs and results
  game/                Combat worker/client, input, renderer, 24-pose playback and replay
apps/web/public/
  assets/              Generated portraits, arena and individual fighter sheets
  models/laya/         Versioned client model manifest, chunks and tokenizer
packages/
  combat-core/src/     DOM-free deterministic simulation and move definitions
  content/src/         User-selected roster and original fictional flavour text
tools/laya/            Pinned full-model ONNX export and parity verification
tests/                 Combat, AI and integration invariants
docs/source/           Original PRD pack, retained as source material
tools/deploy/         Local build and gh-pages branch publication
```

## GitHub Pages

The app uses relative asset URLs and supports project URLs such as `/WST/`. Source lives on `main`; the generated site is published to `gh-pages`. In GitHub, choose **Settings → Pages → Deploy from a branch → gh-pages → /(root)**. The Vite build runs locally instead of on a custom Actions runner. `.nojekyll` tells GitHub that the branch is already built; GitHub still runs its managed Pages deployment step. See [GitHub’s publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

After committing source changes, run `npm run deploy:pages` locally. The script tests, builds and publishes only `dist` through a temporary Git worktree, preserving the source checkout. No client router or server fallback is needed.

Model files are split into static chunks to stay below GitHub's individual file limit. The model increases clone/build/deployment size substantially; see [the Laya runtime notes](docs/LAYA_BROWSER.md) for exact sizes, pinned versions, numerical comparisons and browser limitations. The model executes client-side even though its files are downloaded over HTTP.

## Asset and model boundaries

Each delegate has 24 generated poses across three sheets: base strikes and guard, footwork/jump/crouch, and attack preparation/recovery with dedicated signature poses. The selected pair loads before combat starts. Movement uses deterministic acceleration, quick braking and direction changes, running jumps and air steering. Walking and dashing stop at body contact without displacing an idle opponent; authored attack knockback still applies. Normal attacks have shorter startup/recovery and an eight-tick input buffer. Movement animation advances independently of held-action ticks; small continuous weight shifts and landing compression bridge the generated poses, and rendering smooths the 60 Hz positions on higher-refresh displays. The camera stays anchored to the arena so the opponent cannot visually drag a stationary or retreating player through automatic panning/zooming. This is a 2.5D rendered-sprite pipeline, not artist-rigged 3D likeness meshes.

Audio combines 12 recorded CC0 foley samples from Kenney with original Web Audio synthesis: cloth and air on attack starts, body impact on contact, shoe sounds for footwork/landings, and a distinct signature cue for every delegate. Samples preload once; a shared compressor and limiter feed both playback and recorded clips. There are no cloned voices. Sources and licenses are in [the audio notes](docs/AUDIO.md).

Arena Radio bundles three licensed recorded rock instrumentals: Kevin MacLeod’s **Big Rock**, **Cool Rock**, and **Hotrock** (CC BY 4.0; kit, bass, and electric guitar). Play starts only on a user gesture; station switching and music volume are independent of fight effects. Tracks play locally with no stream, pause when the page is hidden, and the persistent tuner remains mounted between menus and matches. Players can also select an audio file they own from their device; it stays local and is never uploaded. Credits and licence text are in [the audio notes](docs/AUDIO.md).

The generated WST logo is mounted in the header and used for the favicon, touch icon and social previews. Static metadata includes a canonical URL, Open Graph/Twitter cards, VideoGame structured data and a sitemap targeting the expected GitHub Pages project URL. See [brand provenance](docs/BRAND.md).

The base Laya checkpoint is not a trained fighting-game policy. Live and native tests found strongly passive, option-position-sensitive choices. The explicitly labelled **Laya + combat controller** therefore combines genuine model advice with a deterministic local controller that checks delayed public state up to 15 times per simulation second. It closes distance, answers visible threats and applies reachable attacks while Laya runs independently. Model requests start no faster than every 650 ms, adapt to measured latency and never overlap. Each recommendation is checked against fresh delayed context and current legality before use; an idle or unsuitable recommendation cannot freeze the opponent. A 30-second model timeout restarts the inference worker without pausing combat; two failed recovery attempts expose a manual retry. Baseline practice runs this local combat controller without Laya.

AI Cam separates the executed action and its source from the latest Laya recommendation, and shows the player action, distance, health, height, perception delay and decision counts. Both layers see delayed public state, excluding identity, keyboard state, buffered inputs and hidden randomness. This improves playability; it does not retrain Laya or demonstrate fighting competence in the original checkpoint. Numerical export parity only establishes that the conversion preserves output.

This is fictional arcade satire. All quips are original fiction; roles follow the user's supplied cast list rather than a verified current-officeholder directory. No real speeches, cloned voices, injuries, political ability ratings, telemetry service or accounts are included. The original PRD's server architecture and realistic mesh requirements are superseded by the user's client-only and approved rendered-sprite directions.
