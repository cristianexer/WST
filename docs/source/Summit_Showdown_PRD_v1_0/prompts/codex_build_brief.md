# Implementation brief: SUMMIT SHOWDOWN

Read `PRD.md`, all contracts, `production/move_register.csv` and `production/requirements_register.csv` before coding. This is an original browser arcade game and a transparent Laya experiment, not a political judgement simulator. Build in gated increments and preserve working tests.

## Non-negotiable architecture
- TypeScript fixed-step combat core with no DOM, React, model or render dependency; 60 simulation ticks/second.
- WebGL 2 renderer and React application shell. Three.js handles visuals; React state does not drive per-tick combat.
- A common controller interface: human input adapter, labelled baseline adapter and Laya adapter. Real identities never enter the policy observation.
- Python inference service with a pinned, preloaded checkpoint and a typed adapter. Do not invent SDK arguments; inspect the pinned upstream interfaces.
- Versioned schema validation and immutable content manifests. Persistent local preferences/replays first; no account or business database required.

## Increment 1 — runnable greybox
Create anonymous mannequins and a simple arena. Implement the V1 move register, controls, facing, resources, collision, hitstop, round rules, guard levels, throws and capped combos. Resolve identical seeds/input streams reproducibly. Add unit tests around startup/active/recovery boundaries, simultaneous hits, held inputs, pause and focus loss. Do not spend this increment generating political portraits.

## Increment 2 — controller and replay foundation
Implement the heuristic controller behind the same interface, delayed snapshot ring buffer, action commitment and applied-action log. Add replay snapshots/checksums and verify a replay reproduces a match without any model call. Treat fixed-timestep behaviour and cross-browser determinism as tests, not assumptions.

## Increment 3 — Laya integration
Implement contracts exactly as the normalised boundary, not as the upstream raw format. Server constructs criteria from trusted move metadata. Use one in-flight request per fighter, six Hz default/eight Hz cap, delayed observations, epoch/deadline revalidation and explicit failure modes. Expose actual timings and controller source. Do not make up a probability field or let rules silently win exchanges while labelling them Laya.

## Increment 4 — model experiment
Produce reproducible training/evaluation scripts and transparent baseline trajectories. Verify the supported training route against pinned Laya source. Split complete matches before augmentation. Compare base/specialised/no-history/conventional policies. Return the actual results; do not mark fine-tuning as finished without weights and a test report. Model-only latency is not game reaction latency.

## Increment 5 — art integration
Load approved GLB/KTX2 manifests. Validate skeleton, texture, material, triangle and file-size budgets. Load the first complete character pack, not just a head. Implement animation markers, face morphs, eye look-at, contact IK and bounded clothing motion. Keep collision independent of mesh and render rate. Use anonymous placeholders where likeness/source assets remain unapproved, visibly marked in development.

## Increment 6 — public slice
Add selection, tutorial, settings, three tested difficulties, two avatars, summit arena, audio/VFX and truthful AI Cam. Profile desktop targets and implement lower-quality paths. Add genuine error/loading/capacity states; prewarm shaders and model before admission.

## Increment 7 — capture and release
Create replay-driven 16:9 and 9:16 composition. Burn the capture HUD, controller mode and fictional-game label into the actual recorded canvas; DOM-only labels are insufficient. Detect codec support, mix audio and offer a replay fallback. Run the release gates and produce a report with failures as well as passes.

## Content constraints
Equal health, timing, hitboxes, reach and special availability for every avatar. No political preference inference, fake political quotes, cloned real voices, official news framing, leader rankings, fatalities or unapproved source redistribution. Do not use real officeholder names until a versioned editorial record has an official source and review.

## Expected repository
`apps/web`, `services/gateway`, `services/inference`, `packages/combat-core`, `packages/contracts`, `packages/content`, `packages/replay`, `tools/assets`, `tools/evaluation`, `tests/fixtures`, `infra`.

## Required handoff after each increment
Working commands, exact dependency pins, tests executed and results, known defects, changed requirements, performance measurements where applicable and a short demonstration of the increment. A mock, pseudocode, unrun test or placeholder is labelled as such. Do not claim the production game exists merely because the scaffolding builds.
