# SUMMIT SHOWDOWN
## Product requirements and production specification

**Version:** 1.0 | **Prepared:** 21 September 2026 | **Status:** Proposed implementation baseline

**Product:** A browser-native, cinematic fighting game with selectable leader avatars and a Laya-controlled opponent.

**Deliverable status:** This pack defines requirements, production assets, data contracts, acceptance gates and an implementation brief. It does not contain a built game, trained fighter model, licensed leader likenesses or finished 3D assets. All performance, balance and effort numbers are proposed targets unless explicitly identified as a published measurement. Source references [S01]–[S16] are recorded in section 27.

---

## 1. Product decision

Build an original **2.5D fighting game rendered in 3D through WebGL 2**: movement and collision on a readable fighting plane, with cinematic 3D characters, environments and replay cameras. A visitor chooses their avatar and an opponent; the visitor controls one fighter while a specialised Laya policy chooses the opponent’s tactical actions. No installation, account, chat prompt or turn-taking is required to play the public demo.

The experience should feel like a premium arcade game first and an AI experiment second. The technical reveal is **AI Cam**: real decision inputs, action scores, selected actions, measured latency and fallback status, synchronised with the fight. The character’s physical presence must come from animation, timing, materials, sound and contact—not from a claim that the model is conscious or generally intelligent.

**Recommended first public release:** two cleared leader likenesses, one original summit arena, one shared combat kit, two selectable special moves, three difficulty settings, tutorial, training, human-versus-Laya, replay, AI Cam and clip export. Design the catalogue for wider European and US coverage, but expand only after the first two characters meet the visual and gameplay acceptance gates.

**Creative promise:** recognisable faces, tailored clothing, convincing weight, readable exchanges and spectacular theatrical consequences. The action is fictional, non-graphic and recoverable; no fatality system, dismemberment or authentic-looking news footage. This is not a simulation of anyone’s physical ability, character, policies or conduct.

**Working title only:** SUMMIT SHOWDOWN. Conduct a title and branding clearance before public release. Use original music, typography, effects, move names and announcer lines rather than another fighting franchise’s protected expression.

## 2. Goals, audience and success measures

The primary audience is a visitor arriving from a short video who wants to try fighting the model immediately. The secondary audience is a developer, researcher or potential collaborator who wants to inspect what the model actually controls. A producer or artist needs a repeatable pipeline for adding likenesses without rebuilding gameplay.

| Goal | Proposed measure | Release interpretation |
|---|---|---|
| Immediate comprehension | At least 8 of 10 first-time test users identify their controls and the AI opponent without an explanation | Small formative usability sample, not a population estimate |
| Good combat feel | At least 8 of 10 playtesters rate input response and impact readability at least 4/5 | Record device, settings and issues; do not substitute satisfaction for performance tests |
| Responsive rendering | Standard tier targets 60 fps; median frame time <=16.7 ms and p95 <=20 ms in the test scene | Measured after loading and shader preparation, over ten minutes |
| Honest model control | At least 95% of eligible tactical decisions in an admitted live match use a valid Laya result | Report attempted, applied, expired and fallback counts separately |
| Reusable spectacle | Produce a genuine 30–45-second gameplay-led video plus a shareable replay | No staged bot behaviour labelled as live model output |
| Easy expansion | A third avatar binds to the same combat kit without engine changes | Art content may need bespoke corrections; zero identity-dependent combat code |

Track time from page arrival to interactive selection separately from time from **Fight** to first controllable frame. Measure rematch and export use to learn whether the demo is enjoyable; do not guarantee virality or optimise for political antagonism. No political preference, ideology or intended vote is inferred from avatar choices.

## 3. Scope and release boundaries

**G0 — specification and feasibility:** freeze the gameplay contracts, establish a greybox combat simulator, test the Laya interface and assess the likeness-production route.

**G1 — combat proof:** anonymous reference fighters, one greybox arena, shared moves, deterministic tests and a conventional baseline bot. It must be fun enough to play before leader art is commissioned at scale.

**G2 — Laya proof:** a specialised, evaluated policy; delayed observations; stale-result rejection; recorded decisions; an honest fallback; representative concurrent-load measurements.

**G3 — visual vertical slice:** two leader likenesses that have passed editorial and rights review, all shared V1 animations, the summit arena, sound and impact treatment, accessible menus and a functional AI Cam.

**G4 — public-demo candidate:** replay, export, tutorial, three tested difficulty settings, device-quality selection and warm-model admission controls.

**G5 — public release:** cross-browser and load acceptance, reviewed publication assets, source attribution, operational controls and a validated demonstrator video.

V2 may add the third special, additional arenas, broad roster batches, local two-player and Laya-versus-Laya exhibitions. Online human-versus-human, ranked competition, global leader win-rate tables, real-money or points betting, user-uploaded likenesses, live political dialogue, webcam inference, voice cloning and in-browser model inference are outside V1. A public replay feed and accounts are also deferred; they are not prerequisites for sharing a file.

## 4. Core user journey

1. **Arrive.** A brief, muted in-engine attract sequence sits behind the title. Primary action: Play. Secondary actions: How the AI works and Settings. A visible label states “Fictional arcade satire · AI-controlled opponent”. A still image replaces the attract sequence on low-power or reduced-motion settings.
2. **Choose.** The visitor selects a player avatar and an opponent from the same catalogue. Each card contains a name, office label where verified, catalogue date and a preview—not an assessment of the individual. Select difficulty and one of the shared specials independently of the avatar.
3. **Prepare.** Load only the selected character bundles and arena. Show stages such as downloading, decoding, preparing shaders and connecting to Laya. Offer a labelled baseline practice mode if the model is unavailable; never show a false online indicator.
4. **Learn.** An optional brief tutorial teaches movement, one attack, guard, a low/high mix and a special. Prompt glyphs match the active input device. A single skip action proceeds to the match.
5. **Fight.** Best of three rounds, 60 seconds per round. The camera keeps both characters readable. No modal dialogue or model waiting spinner blocks human input during the round.
6. **Inspect.** An AI Cam button opens a compact overlay showing the most recent completed decision. An optional expanded, paused inspector provides its full permitted observation and action list. It is not a fabricated reasoning transcript.
7. **Finish.** Present this match’s score, replay highlights and technical summary. Results describe the player and controller; do not turn them into a judgement or ranking of real leaders.
8. **Replay and share.** Review the action, change replay camera framing and export a clip with fiction and controller labels. Offer Rematch, Change fighter and Finish. No forced engagement loop.

## 5. Screen and interaction specification

| Screen | Composition and behaviour | Required states |
|---|---|---|
| Landing | Full-bleed arena, concise title, one prominent Play action; technical detail behind a secondary action | Normal; reduced motion; WebGL unavailable |
| Roster | Left player slot, right opponent slot; two large 3D previews; searchable grid below | Unselected; selected; loading; blocked asset; archived catalogue |
| Match setup | Difficulty and shared special selectors; controls and quality preset visible | Laya ready; warming; at capacity; baseline practice |
| Fight | Health top left/right, round marks and clock centrally, stamina below health, meter lower corners | Ready; active; hitstop; pause; round end; disconnect |
| AI Cam | Narrow side panel; no obscuring fighter silhouettes; controller, source tick, action scores and timings | Live; waiting; stale result discarded; fallback; recorded replay |
| Pause/settings | Genuine DOM modal with focus containment; sliders, toggles and remapping | Keyboard/gamepad; reduced effects; audio off |
| Results/replay | Match result, timeline, clip markers, actual model application rate and export action | Replay compatible; export available; fallback download |
| Credits/about | How the controller works, source/asset attributions, fiction notice and contact | Versioned content; accessible text view |

**Visual system.** Charcoal and near-black surfaces, warm ivory text, restrained brass arena accents and distinct cyan/orange player indicators. Use a licensed condensed display face for headlines and a readable sans-serif for controls; this pack does not include font binaries. A spacing scale of 4/8/12/16/24/32 px and consistent 8–12 px panel radii should keep the non-game UI precise. Minimum interactive target 44×44 CSS px where practical. Do not use national flags as the only labels.

The 3D selection preview must show a neutral idle, weight transfer and a short original pose; it must not reuse a real speech. Catalogue browsing uses portraits and lazy loading, not dozens of simultaneously animated full-resolution characters. A mirror match uses material and silhouette accents to distinguish fighters while retaining the same controls and collision volumes.

## 6. Combat rules and control model

The authoritative V1 combat simulation runs locally at **60 fixed ticks per second**, independent of rendering and inference. One metre equals one world unit; the arena’s playable span is 14 m. Fighters move along X, jump along Y and remain on the same Z fighting plane. Cosmetic depth and cameras do not create additional attack ranges.

Each fighter starts with 1,000 health, 100 stamina and zero special meter. Every avatar uses the same mechanical profile, canonical 1.82 m combat envelope, reach, mass, damage and timing. Display proportions are an artistic normalisation, not a claim about real height. Facial identity and clothing differ; combat strength is never assigned from age, nationality, sex, office or political affiliation.

**Round rules.** A knockout occurs at zero health; the clock stops and a theatrical, non-graphic round-end pose plays. At time expiry, higher remaining health wins. Equal health is a drawn round; play at most one additional deciding round, then allow a drawn match. A simultaneous knockout is a drawn round. A match normally ends at two round wins. No hidden comeback damage, health regeneration, forced AI victory or dynamically changed frame data.

**Stamina and meter.** Initial design: neutral regenerates 12 stamina/second, guard 8/second, with a 0.5-second delay after a spend; attacks and hitstun do not regenerate. Insufficient stamina makes the relevant action unavailable. A successful strike earns 10 meter, a blocked strike 4 and taking a damaging hit 2, capped at 100. Specials spend 100. Guard damage is a separately exported integer per move, initially derived from 18% of move damage with a minimum of 4; no health chip damage in V1. A broken guard causes 36 ticks of stagger and restores 25 stamina at its end.

**Directional defence.** High guard blocks high, mid and overhead strikes; low guard blocks low and mid. High strikes miss a fully crouched canonical head volume. Throws beat held guard but provide a break window. There is no automatic perfect block because a classifier returned slowly.

**Input defaults.** A/D move; W jump; S crouch; J light; K heavy; Space guard; L dash with direction; U throw/break; I parry; O special. Down+J is body punch, Down+K low kick, Forward+K overhead and Forward+J anti-air. Escape pauses; AI Cam uses a remappable key such as C, not a hijacked browser Tab sequence. Gamepad actions have equivalent mappings and an on-screen reference. Remapping must be saved locally. Input capture stops when a text control, pause menu or another tab has focus.

Resolve opposing directional inputs to neutral. Prioritise legal throw-break, then special, parry, attack and movement commands when simultaneous; document and test the exact order. A five-tick input buffer may queue the next legal action but may not bypass recovery. Autorepeat keydown events cannot create extra attacks. Focus loss pauses single-player simulation and releases held inputs.

## 7. Moves, frame data and combo contract

`production/move_register.csv` is the initial balancing register: **22 action entries, 21 assigned to V1 and one additional V2 special**. Some entries are movement or held defence rather than attacks. Startup/active/recovery values are design starting points, not mocap lengths or measured balance results.

| Action group | V1 content | Gameplay purpose |
|---|---|---|
| Striking | Straight, body, heavy cross, low kick, overhead, rising strike, air kick | Distinct range, timing and defensive responses |
| Close-range interaction | Throw and throw break | Counter passive blocking with a readable escape opportunity |
| Defence | High guard, low guard and Veto parry | Commitment and mix-up; no universal invulnerability |
| Movement | Advance, retreat, crouch, forward/back dash, jump and idle | Position and spacing; no automatic homing attack |
| Shared specials | Diplomatic shield and Paperwork burst | One defensive and one offensive option available to every avatar |
| V2 special | Summit adjourned | A short lunge with a theatrical podium-related end pose |

At 60 Hz, a move with startup S, active A and recovery R has first active tick S+1 and nominal duration S+A+R. CSV “active=1” for a held state denotes its loop sample, not a one-tick cap. Paired interactions and success branches use explicit timeline events. First-active hit advantage for an ordinary strike is `hitstun - ((A-1)+R)`; later contact changes remaining recovery. Export tests calculate these values rather than relying on an artist’s estimate.

**Hit resolution.** Gameplay hitboxes and hurtboxes are canonical, tick-indexed data. Animation bones may be used in authoring to derive them, but a render-frame pose, LOD change or cloth simulation cannot determine damage. Resolve all collisions for a tick together so valid trades are possible. A hit instance can damage a particular target once unless explicitly marked multihit; V1 specials are single-hit. Apply fixed pushback and clamp arena bounds without moving a fighter through the other one.

**Combos.** Start with a constrained light-to-body-to-heavy route. The light can cancel into body on confirmed hit during local move ticks 10–16, not on whiff; body can cancel into heavy during ticks 15–22 on confirmed hit. These windows are exported in the move register. V1 chains cap at three damaging strikes, scale subsequent damage to 85% then 70%, and end in a separation/recovery state. Throws and specials cannot reset the chain. Do not implement an unrestricted animation graph whose accidental cancels produce infinite combos.

**Counter hits.** A strike landing during an opponent’s committed attack startup can add a 1.15 damage multiplier, rounded consistently; exclude throws and specials in V1. Show “Counter” from the engine’s collision event, not from a model claim.

**Paired throw.** Contact opens a 12-tick break window before damage. Both characters attach to canonical interaction anchors; the victim pose and attacker pose use the same timeline. The throw’s damage marker, break branch, remaining recovery and victim knockdown are explicit data, not inferred from playback percentage. Test both left/right orientations and all outfit combinations.

## 8. The opponent: Laya’s actual responsibility

Use one preloaded, pinned Laya checkpoint specialised for the game. The published project describes typed `choice`, `score` and `noul` outputs rather than generated dialogue. Its English checkpoint is listed at 421M parameters, with different sizes/configurations for other variants. The choice interface is a candidate for action selection; none of those facts establishes combat competence. [S01]

**The model selects tactics.** It chooses from a compact set of legal action options at neutral or other valid decision boundaries. The engine handles input timing, action commitments, hitboxes, collisions, animation, camera, audio and rendering. Held guard or movement may persist until the next boundary. A legitimate committed action should not be interrupted simply because a newer distribution arrives.

Default request rate is six decisions/second per active AI fighter, hard-capped at eight; pause, menus and non-interactive cinematics make no requests. Do not call separate threat, range and move questions at every tick. Start with one action question. The final action vocabulary and concise descriptions must fit the selected checkpoint’s measured token budgets; supply at most 16 eligible candidates per request using documented deterministic filtering. First remove state/resource-invalid moves and impossible-contact interactions. If more than 16 remain, keep idle, applicable guards and basic spacing and rotate remaining eligible attacks in a fixed, versioned order. Log pruning reasons and test move coverage; filtering must not secretly choose a tactical counter.

**Observed state only.** Supply relative distance, facing, grounded/airborne state, public health/stamina/meter, visibly started actions, coarse phase, distance to arena bounds, the AI’s own action lock and a short history of completed or already visible player actions. Exclude current keyboard input, buffered inputs, future random values, unpublished move choices, exact future trajectories, political identity, name and country. The request schema contains no leader identifier. Rendering an avatar and choosing its behaviour are separate systems.

**Perception delay.** Standard difficulty starts with a 12-tick (200 ms) observation delay. Beginner uses 18 ticks and expert nine, subject to playtesting. Observations are taken from the delayed snapshot—not from the present state with a delayed timestamp. Model/network latency adds to effective reaction time. A short attack can therefore land before the opponent could react; defence must often have been selected in anticipation. That is intentional, not a reason to give a hidden reflex bot control.

**Adaptation.** A rolling history can include the last eight public actions plus frequencies over recent completed exchanges. Changing a response to this history is in-context policy adaptation. Model weights do not update during a visitor’s match. “Learning during the fight” must not imply online training unless that separate mechanism is later implemented and evaluated.

## 9. Decision scheduling, latency and failure handling

Use a WebSocket between the browser gateway and inference service. The gateway issues a short-lived session token and sends versioned requests. Maintain at most one in-flight inference per AI fighter. A new eligible state replaces an unsent pending snapshot; it does not create an unbounded queue.

Each request includes `request_id`, `match_id`, `round_id`, `request_tick`, `observed_tick`, `decision_epoch`, `expires_at_tick`, schema version, policy version and legal action IDs. The response echoes correlation fields and includes an action, its actual returned score data, compute timings and controller source. These are **our normalised integration contracts**, not a claim that the upstream SDK has this wire format.

**Application gate.** Apply only a response for the current request, round, epoch and policy version. The age limit is 18 request ticks (300 ms), with a 250 ms wall-clock service deadline during unpaused play. Revalidate that the actor can act and the chosen action remains legal. Changed range may invalidate a throw even when an attack is otherwise allowed. Reject late, reordered, duplicate, malformed, impossible or NaN-containing responses. Log the reason. A tick deadline must never become accidentally extended by slow rendering; focus loss and pauses cancel outstanding requests and increment the epoch.

**Fallback.** Preserve a still-valid committed action. At a free boundary without a valid result, choose neutral idle rather than an undisclosed perfect block. If failures persist for one second, pause and offer reconnect or explicitly labelled baseline practice. The switch is recorded. Baseline practice remains playable but is not advertised as Laya. If the service is at capacity, do not admit another live match until a warm slot exists.

The repository’s detailed T4 table reports 39.5 ms for one English-model question and 32.8 ms for one multilingual-model question. Those are author-reported benchmark conditions, not this game’s timings. Multiple questions in one call do not mean constant latency, and batching questions over one state is not evidence of equivalent batching across independent matches. [S02]

**Proposed game targets:** warm service queue p95 <=10 ms, normalised end-to-end decision return p95 <=150 ms on the declared test network, and >=95% valid applied decisions for admitted sessions. Report preprocessing, queue, model forward pass, server total, browser round-trip and local application delay separately. Effective response includes perception delay and scheduling; never put model-only milliseconds beside a human reaction figure as though they were equivalent.

## 10. Specialisation and evaluation plan

The project authors explicitly warn that base-model typed decisions can be weak and raw scores overconfident; fine-tuning and calibration are part of their intended workflow. This release therefore requires task-specific evidence, not confidence thresholds applied to an untested base checkpoint. [S03]

**Training path.** First make the headless combat engine reproducible. Produce trajectories from several transparent baseline styles: approach-and-attack, defensive spacing, counter-oriented and random-legal. Use simulation rollouts to compare feasible actions from observed states; do not let a label generator read an opponent’s future input queue. Start with approximately 50,000 diverse labelled boundaries, expanding towards 250,000 only if held-out errors justify it. These are experiment sizes, not a promise of adequate learning.

Separate training, validation and test by complete match, seed, opponent policy and scenario family before augmentation. Include both sides, mirrored coordinates, ambiguous situations, low resources, recovering states, corners, jumps, guard breaks and repeated-attack patterns. Randomise candidate order during appropriate tests to expose positional bias. Retain multiple good actions rather than treating a single hindsight move as the only rational answer.

Pin model, SDK, tokenizer, preprocessing, action vocabulary and simulation versions. Adapt the upstream training route only after confirming the actual supported interfaces; this pack does not invent an executable fine-tuning command. Fit any score calibration on validation data and evaluate calibration on the untouched test set. Assess task utility and legal-action validity separately: a high score does not imply that an action will win an exchange.

**Minimum comparison set:** base Laya; specialised Laya; the same specialised model without history; a small conventional policy trained on the same features; and fixed heuristic opponents. Use anonymous avatars. Match observation delays, action interfaces and, where relevant, scheduling/latency traces. Run at least 1,000 held-out matches per main comparison after the smoke tests, report Wilson intervals for win proportions and bootstrap intervals for continuous measures.

Required outcomes are legal action application, stale/fallback rates, resource use, damage exchange, repeated-pattern response, difficulty separation, calibration where used and latency under declared concurrency. The no-history ablation should show whether history helps. The conventional-policy comparison must remain in the report even if it wins. Ship a technically honest demo if Laya is viable; do not claim a general AI breakthrough or superiority from a cherry-picked clip.

## 11. Roster design and editorial workflow

The catalogue separates **person**, **office tenure**, **avatar asset version** and **combat profile**. A person can hold multiple offices or appear in a historical snapshot without duplicating the underlying likeness. Each published card has an official source, verification date, display label, valid tenure interval where known, localisation record, rights status and immutable asset hash.

`production/roster_coverage.csv` contains **52 proposed catalogue entries** for a broad European-and-US production scope, including a separately labelled expanded-coverage group. This is an editorial coverage plan, not a verified current-officeholder directory or a statement about sovereignty or continental boundaries. The KOS identifier is an internal catalogue code. All officeholder fields intentionally remain blank and publication is blocked until reviewed.

Support presidents and heads of government where those offices exist, plus an explicit exception workflow for collective, rotating, dual or differently named constitutional offices. Do not automatically create two people per country or substitute a monarch for a non-existent president. The editor must decide how an exceptional office fits the intended roster and document it. The implementation should accommodate these structures without embedding assumptions in UI code.

**Publication sequence:** identify the current holder from the office’s official source; verify the applicable office and spelling; record the source and date; create the reference pack; complete likeness and rights review; validate runtime assets; publish a versioned roster update. A change alert creates a review task, not an automatic replacement. Do a complete verification for each release snapshot and trigger additional review for credible reported office changes; the game does not need daily scraping of all governments.

Order cards alphabetically or by a visitor-selected neutral catalogue filter. Do not default to an opponent based on assumed political preference or geolocation. Exclude campaign slogans, competence/strength ratings, political personality scores and public leader rankings. The same gameplay kit and specials are available for every avatar. A person’s real views are not model inputs and are not represented by combat tactics.

## 12. Art direction: cinematic realism without a false-news look

The goal is **recognisable, high-quality digital doubles in an unmistakably fictional arena**. Avoid oversized caricature heads, plastic skin and generic stock-animation posing. Equally, do not recreate a news broadcast, actual assault, real press-conference clip or authentic speech. Persistent game framing and a fiction label survive replay and export.

At fighting distance, silhouette, hairline, face proportions, clothing fit and posture carry recognition. At selection distance, eyes, skin roughness, nasolabial and eyelid structure, believable neck transitions and expression deformation matter. A sculpt that looks good only in one front-lit portrait is not accepted. Use neutral, consistent review lighting before cinematic colour grading.

**Hero shot:** eye-level three-quarter view, soft arena key, darker contrasting background, controlled rim light, natural skin response and subtle breathing. **Fight shot:** clear side-on framing, a stable horizon, a readable gap between limbs and bodies, and shadows that visibly anchor shoes to the floor. **Impact shot:** weight transfer, contact compression, timed head/torso response, cloth follow-through and sound aligned to the collision tick. No visual effect can substitute for missing contact.

Shared art rules cover all avatars. Do not exaggerate infirmity, make medically suggestive animations or derive fighting ability from a real person’s appearance. Original neutral exertion and match poses are performed by contracted actors or animated by artists; they are not assertions of how those people would act.

## 13. Per-leader 3D asset specification

Each leader requires a complete production pack, not merely a generated portrait or a textured head on a stock body. `production/asset_register.csv` contains 66 reusable asset-specification rows across per-leader, shared, arena, effects, audio and UI work. A “per leader” row must be fulfilled for each published likeness; these rows are requirements, not delivered assets.

### 13.1 Reference and likeness pack

Collect front, both profiles, both three-quarter views and useful neutral/expression references with date, photographer/source, access basis and intended usage recorded. Prefer consistent focal perspectives; one exaggerated wide-angle photograph cannot define facial geometry. Record a concise feature sheet covering face shape, hairline, ears, brow, nose, jaw and distinctive visible accessories. Do not add a political personality profile.

Reference use, texture use, redistribution, likeness clearance and artist contracts are separate fields. A photo being visible on an official website does not, by itself, clear every intended reuse. A downloaded image or AI-generated turnaround is not proof that a 3D asset is licensed or production-ready. Use concept generation only as an optional visual exploration stage, followed by artist verification, topology work and rights review.

### 13.2 Required geometry and delivery files

| Component | Required deliverable | Acceptance focus |
|---|---|---|
| Head/neck | High-resolution sculpt, clean retopology and LOD meshes | Identity at front/profile/3/4; clean neck seam; eyelid and mouth loops |
| Body | Canonical-envelope body mesh on shared rig | Natural anatomy and clothing fit; equal gameplay dimensions |
| Wardrobe | Primary outfit, shirt/collar, cuffs, shoes and relevant accessories | Deformation in guard, crouch, overhead and fall; no painted-on jacket |
| Hair | Scalp base plus groomed hair cards; facial hair where applicable | Silhouette, hairline and clean alpha edges at fighting distance |
| Eyes/mouth | Eyeballs, corneal layer, lashes, teeth and mouth cavity | Correct gaze and blink, no hollow mouth during exertion |
| Rig/face | Skeleton binding, weights, 24 facial morphs and expression mapping | All clips and facial combinations pass pose review |
| Textures | Skin, wardrobe and accessory PBR sets with compressed runtime variants | Consistent colour spaces, roughness response and no baked lighting |
| Runtime pack | LOD GLBs, KTX2 textures, manifest, portraits and validation reports | Transfer, memory, shader and draw-call budgets pass |

Editable source files must accompany the runtime exports where the production agreement permits. Keep restricted source art separate from public CDN assets. File names include avatar ID, component, LOD and version; manifest hashes identify exact published bytes.

### 13.3 Geometry, skeleton and material budgets

These are proposed upper bounds to validate in the target browser, not an assurance that any asset under the limits will run quickly.

| Tier/use | Geometry per fighter | Material/rig limits |
|---|---|---|
| LOD0: selection close-up or hero replay | <=120,000 triangles including hair, clothing and mouth | <=8 material primitives; up to 4K face texture only when explicitly loaded |
| LOD1: standard fight | <=60,000 triangles | <=8 material primitives; 2K primary atlases |
| LOD2: low/mobile tier | <=30,000 triangles | <=5 material primitives; 1K/2K atlases; reduced facial effects |
| LOD3: distant/thumbnail fallback | <=12,000 triangles | <=3 material primitives; simplified hair and interior mouth |
| Shared rig | <=90 deform joints and max four skin influences per vertex | Root transform fixed; required socket names and bind-pose hash |

The standard incremental character payload targets <=12 MiB compressed transfer, excluding the shared animation pack. Measure GPU residency independently: compressed download size is not decoded memory use. Body geometry hidden permanently under clothing may be removed only after the clip and outfit test suite proves there are no holes. Hair-card transparency, extra material passes and shadow casting can cost more than a modest triangle increase; inspect them explicitly.

### 13.4 Facial rig and skin treatment

The 24 required morphs are: browInnerUp; browDownL/R; browOuterUpL/R; eyeBlinkL/R; eyeSquintL/R; eyeWideL/R; jawOpen; mouthClose; mouthSmileL/R; mouthFrownL/R; mouthPressL/R; mouthStretchL/R; cheekRaiseL/R; and noseSneer. Eye orientation is bone-driven. A mapping file defines bounds and compatible blends. These are authored animation controls, not inferred real emotions.

Use a clean skin base colour, normal detail, roughness variation and ambient-occlusion information; optional thickness or wrinkle masks require a tested shader path. Test forehead/nose highlights, eyelids, lips and ears under the neutral review light. Avoid uniform wet/plastic gloss. Sweat-like cosmetic highlights may increase over a round using a visual parameter, with no corresponding claim about a person’s health or fitness.

### 13.5 Clothing and secondary motion

Model lapel thickness, collar overlap, shirt-to-jacket separation, cuff visibility and shoe contact. Use corrective shapes at shoulders, elbows, hips and knees. Ties, jacket hems and loose accessories use a small secondary bone chain with bounded damping; full cloth simulation is not a release dependency. Cosmetic motion must not move hitboxes or delay attack startup. Record secondary motion seeds or cache its curves for faithful replay.

**Per-leader acceptance:** recognisable neutral identity approved by the content/artist review; planted foot sliding <=2 cm in the test pose sequence; paired hand/torso contact error <=3 cm at marked contacts; no visible skin/clothing penetration in the curated V1 action matrix; complete blinks; clean LOD transitions; and no leaked restricted reference images in the runtime bundle. Numeric contact tolerances are production targets measured in the canonical scene.

## 14. Asset creation and sourcing route

**Recommended route:** a character artist builds a custom head and fits a licensed or commissioned body/wardrobe system to the common skeleton. Use Blender or another established digital-content tool for editable sources, retopology, rigging, baking and glTF export. Commission the first two likenesses to the same brief so that proportions, texture response and expressions look like one game rather than unrelated marketplace models.

**Optional high-fidelity starting point:** MetaHuman can accelerate a digital-human authoring route. Epic’s current licensing page says MetaHumans may be used with other engines or creative software, subject to its licence terms. That is not a claim that an untouched MetaHuman export is a lightweight WebGL asset. Budget for rig simplification, hair-card conversion, material baking, facial conversion, LODs and browser validation. Confirm the applicable licence and project conditions before procurement. [S09]

**Animation prototyping:** Mixamo’s FAQ permits its characters and animations in personal, commercial and non-profit projects. Use it as a prototyping source only where the selected content’s use and distribution are suitable. Generic clips still need combat timing, contact, retargeting and wardrobe cleanup. Do not package third-party source animation files into an open repository without checking redistribution terms. [S10]

**Production stages:** reference/editorial approval → neutral sculpt review → retopology/UVs → body and garment fit → rig/weights → morphs → animation contact tests → PBR baking → LODs/compression → engine lighting review → performance/rights gates → versioned publication. The producer signs off likeness and provenance; the technical artist signs off export; the combat engineer signs off equal contact envelopes.

A text-to-3D or image-to-3D mesh may be evaluated as a starting point, never accepted automatically. Problems to inspect include fused fingers, unusable eyelids, baked highlights, asymmetrical ears, clothing welded to skin, missing mouth interiors and excessive density. This is a single production review checklist, not a requirement to repeatedly inspect an already approved unchanged asset.

## 15. Rig, animation and contact pipeline

The common skeleton uses a stable root at floor centre, an explicit motion root, pelvis, spine, neck/head, clavicles, arms, hands/fingers, legs and feet. Character-local +Y is up and +Z is forward; the runtime maps facing to the fighting plane. Exported units are metres and scale is 1. The renderer’s orientation conversion is documented once and unit-tested. glTF defines its coordinate/unit conventions, skinning, morph targets and animation representation; runtime GLB assets should conform to that specification. [S06]

Required sockets are head, chest, left/right hand, left/right foot and a neutral presentation anchor. Do not rename bones per avatar. Gameplay locomotion is in-place visually: authored root displacement is extracted into canonical move curves applied by the simulation. Applying both clip root motion and gameplay movement is a defect. Create mirrored data offline with proper bone mapping rather than negative-scaling the runtime skeleton.

`production/animation_register.csv` specifies **62 shared V1 clips, four per-leader presentation clips and two additional V2 clips**. The two-leader V1 therefore needs the 62 shared clips plus eight individual presentation clips, before any extra garment corrective variants. Each row identifies phase, loop status, root-motion mode and acceptance requirements.

Shared coverage includes idle/breathing/gaze; forward/back locomotion and dashes; crouch transitions; takeoff/air/landing; seven strikes; guard enter/hold/exit; parry branches; attacker/victim throw and escape; direction/intensity-specific hit and block reactions; guard break; knockdowns and get-ups; round poses; and both V1 specials. Facial and breathing layers can continue during a held tactical action but cannot change collision state.

**Animation markers:** anticipation start, foot plant/lift, hitbox enable/disable, contact, sound cue, visual effect cue, cancel-open/close, paired attachment/release and recovery end. Store gameplay-critical events in validated external move data, not solely as authoring-tool metadata that the exporter might drop. Pose playback samples the simulation clock. Round replay samples the same clock even when the presentation camera runs at another frame rate.

**Polish rules:** preserve a clear wind-up silhouette; move force through planted feet, pelvis, spine and striking limb; compress contact before recoil; follow through with cloth and accessories; return to a believable guard rather than snapping to a generic idle. Heavy attacks must look committed for their actual recovery period. Idle motion is subtle and offset between fighters; no synchronised breathing loops.

**Paired and ground states:** use contact anchors and bounded inverse-kinematics correction. The damage/stun timeline owns gameplay; animation may blend or time-warp within approved ranges to show the transition. Do not let a 48-frame get-up clip secretly add recovery to a move defined with fewer simulation ticks. A collision already resolved cannot be undone because an animation event arrived late.

## 16. Arena, cameras, effects and sound

### 16.1 Summit arena

Build an original international conference hall, not a faithful recreation of a real security-sensitive venue. Materials include dark timber, fabric, brushed metal, textured stone and glass. Place a generic summit emblem, geometric screens and furniture beyond the fighting lane. Background delegates are indistinct instanced figures, not additional political likenesses.

The standard visible arena targets <=250,000 triangles, <=80 main-pass draws and <=12 MiB compressed transfer. Separate the simple gameplay bounds from decorative geometry. Use baked ambient contribution, reflection probes/environment lighting and one live shadow-casting key light. Optional secondary lights should avoid additional shadow passes. A podium may use 8–12 pre-fractured pieces with capped lifetime; its debris is cosmetic and cannot unpredictably block the fighters.

Stage interaction is limited to deterministic, telegraphed cosmetic triggers after appropriate contacts. No weapons, civilians in the collision lane or hazards that favour a selected nationality. A camera anchor file supplies selection, intro, gameplay, impact replay and portrait-safe framing.

### 16.2 Camera and impact treatment

Gameplay camera follows the midpoint with a bounded distance response and a stable horizon. It never rotates across the fighting plane and swaps control directions mid-exchange. Keep both feet and heads visible; expanding separation must zoom before either fighter reaches the edge.

Use common hitstop of 3/5/7 simulation ticks for light/heavy/special contact as initial values, frozen for both fighters and the round clock. Game-authoritative timers pause consistently; async responses arriving during the freeze remain subject to epoch/deadline validation. Small impact impulses may affect the camera visually but not aim, input or collision. Optional vibration and camera shake have independent intensity controls. No uncontrolled full-screen flashes.

Show spectacular close-ups in intros and replay, not by interrupting a live opponent’s readable startup. Live specials can have a small bounded camera push but must preserve combat state visibility. Defeat transitions to an original seated, staggered or kneeling recoverable pose followed by round reset; never imply an authentic injury event.

### 16.3 Sound

Commission or license impact layers, shoe pivots, clothing movement, air movement, parry/shield effects, arena ambience, UI sounds, music stems and a generic announcer. Use actor-recorded exertion, not a clone of a leader’s voice or edited real speech. Masters are 48 kHz WAV; browser encodes are chosen after target-browser testing. File counts in the asset register are planning quantities.

A convincing impact combines a short contact transient, low body component and cloth/air detail. Choose seeded variations and small pitch changes to avoid repeated machine-gun samples. A block, parry, whiff and body hit need distinct audio and visual signatures. Footstep cues come from the clip’s plant markers. Audio starts only after an appropriate user gesture, and all important information has a visual equivalent.

Separate master, effects, ambience, music and announcer buses with a limiter and no clipping under the maximum-overlap test. The export audio mix must include the same effect events and licensed music choices as the replay. Do not label an internal loudness target as a social platform’s mandatory standard without verifying that platform’s current guidance.

## 17. Renderer and browser-performance budgets

Three.js’s WebGLRenderer currently uses WebGL 2; the product therefore requires WebGL 2 and performs a capability check. Lack of a usable context yields a clear explanation and a recorded-demo alternative, not a broken canvas. No WebGPU requirement is introduced for V1. [S04]

Use React and TypeScript for the application shell; Three.js owns the scene/render loop. React state is not updated for every simulation entity on every tick. Use explicit engine stores and low-frequency HUD updates; smooth health/meter presentation separately from authoritative numeric values. Use stable object pools for transient effects. Avoid runtime shader recompilation and asset decoding during a round.

| Budget | Standard target | Lower/optional path |
|---|---|---|
| Render resolution | 1920×1080 internal target, capped device-pixel ratio | Dynamic resolution down to 1280×720; no change to simulation Hz |
| Fighter detail | Two LOD1 fighters, <=120k combined triangles | Two LOD2 fighters, <=60k combined |
| Total scene | <=450k visible triangles; <=140 main-pass draws; <=200 including auxiliary passes | Lower crowd, shadows, transparency and effects |
| GPU assets/targets | <=320 MiB estimated resident allocation | <=180 MiB low tier; exact browser memory may not be directly queryable |
| CPU content | <=256 MiB estimated decoded content, excluding engine/browser overhead | Bounded caches, evict unselected likenesses |
| First playable transfer | <=48 MiB standard selected match | <=30 MiB low tier; no full-roster preload |
| Application shell | <=2.5 MiB compressed JavaScript/CSS initial transfer | Lazy-load editor, capture and analysis features |
| Rendering acceptance | Median <=16.7 ms; p95 <=20 ms; p99 <=33 ms | 30 fps low tier with unchanged 60 Hz combat and an explicit quality label |

A suggested 48 MiB transfer allocation is 24 MiB for two characters, 12 MiB for arena, 4 MiB for shared animation, 2 MiB audio, 2 MiB shell/UI and 4 MiB reserve. It is an allocation target, not a file-size guarantee. Under a controlled 50 Mb/s test connection, target first controllable frame within 15 seconds from choosing Fight, including decoding, shader preparation and service readiness. Report cold and warm cases independently.

GLTFLoader supports relevant compressed asset paths; KTX2Loader transcodes Basis texture data for device support. Adopt a tested GLB plus KTX2 pipeline with optional Meshopt compression and a validated decoder bundle. Choose normal-map compression by visual testing rather than file-size alone. Keep an uncompressed authoring/QA export for diagnosis. [S05][S07]

WebGL memory budgets require estimation rather than assuming a portable VRAM query. Track geometry, texture and render-target allocations; use lower-resolution back buffers, mipmaps, batching and prompt disposal of unused resources where appropriate. Run a context-loss recovery test and a 20-rematch memory-soak test. [S08]

Proposed test matrix: Windows with an integrated-GPU laptop and a mid-range discrete GPU; macOS on Apple Silicon; Chrome, Edge, Firefox and Safari where applicable, with actual versions captured in the release report. Mobile V1 supports browsing and watching replays; touch fighting is experimental until independently tested. Do not market desktop-only input as universal browser support.

## 18. System architecture and deployment

**Browser:** application shell, capability probe, asset loader, fixed-step combat, input adapter, rendering/animation, audio, replay buffer, AI gateway client and accessible HUD.

**HTTP/WebSocket gateway:** issues anonymous short-lived sessions, validates schema/rate limits/origin, forwards permitted observations and enforces admission capacity. It does not trust a browser-supplied instruction prompt. No upstream model key or privileged storage credential is shipped to the browser.

**Laya inference service:** a long-running Python process with one selected checkpoint preloaded, a normalisation adapter, bounded queues, warm-up probes, health/readiness endpoints and typed decision validation. Pin the source and weight revisions. Disable general-purpose tools and outbound fetching from the inference path. The service cannot execute browser text as code or instructions.

**Content delivery:** versioned immutable public GLB, KTX2, audio and metadata objects served through HTTP caching/CDN. Restricted authoring assets live in a separate access-controlled store. Match logs are local by default; public hosting of replay files can be added later with short retention and abuse controls.

**V1 state:** no business database is required. Use local storage for preferences and IndexedDB for bounded replay data. Backend session/admission state can be in-memory for a single instance; introduce Redis only when multiple gateway/worker instances require it. Do not add Kubernetes, a vector database, a chat framework or a full agent orchestration platform to this demo.

**Development topology:** local frontend and gateway plus an inference-service container with a persistent weight cache. A CPU-only machine may run baseline practice or call a remote development GPU endpoint; it is not assumed to meet live-Laya latency. A Docker Compose implementation should provide separate baseline, CPU-development and NVIDIA-GPU profiles, without requiring GPU support merely to inspect the frontend. Match the platform-specific container requirements during implementation; no untested compose file is claimed as included here.

**Deployment:** static frontend/CDN, a regional gateway and a GPU service. Route a session to one healthy worker, and publish capacity from measured p95 performance. Logs distinguish build, simulation, moveset, roster and model versions. Blue/green or canary deployment preserves old assets for active replays. Rollback switches the manifest and model version together; existing matches finish on their assigned version.

## 19. Contracts, persistence and replay fidelity

The package includes JSON Schemas for leader manifests, decision requests, decision responses and replay manifests, plus illustrative examples. They define the normalised product boundary and contain fictional placeholder records, not verified leaders or measured model outputs. Cross-field and gameplay invariants additionally require runtime validators; JSON Schema alone cannot prove an action is legal.

**Key objects:** `LeaderIdentity`; `OfficeTenure`; `AvatarAsset`; `CombatProfile`; `MoveDefinition`; `AnimationClip`; `ArenaDefinition`; `MatchSession`; `FighterSnapshot`; `DecisionRequest`; `DecisionResult`; `CombatEvent`; `ReplayManifest`; `AssetLicence`. Keep an avatar identity out of the policy observation. A match can reference avatar IDs for rendering while its AI request uses only self/opponent combat state.

**Deterministic core.** Use integer/fixed-point positions and bounded arithmetic for the combat model where practicable, explicit rounding and a seeded random stream. Rendering, cloth and background effects do not feed back into combat. A fixed timestep alone does not prove cross-browser determinism: test replays on the supported implementations and capture state checksums. Physics libraries may serve cosmetic debris, never authoritative collision without a separate deterministic verification programme.

Record initial state, input transitions with ticks, applied AI actions, rejected decision reasons, sampled action IDs, round events, RNG seed, pause/hitstop events and version hashes. Save periodic canonical snapshots, initially every 120 simulation ticks, and checksums for drift detection. Replay consumes recorded applied actions and does **not** call Laya again. Pin presentation random seeds or record cosmetic curves where required for faithful re-rendering.

Default replay limits: last five matches locally, bounded total storage of 100 MiB, visible deletion controls and a clear export action. If storage is unavailable, retain an in-memory replay for the active session and explain the limitation once. A published replay snapshot should retain its original roster date, rather than silently displaying a new office title.

Downloaded replays must be parsed as data, size-limited and schema-validated; never eval code or follow arbitrary asset URLs. Only permit immutable assets from the approved manifest. If a replay’s simulation version cannot be loaded or checksums disagree, state that it is incompatible rather than presenting a silently different match. A previously exported video remains viewable separately.

## 20. AI Cam and evidence design

The default overlay shows **Controller: Laya / Baseline / Fallback / Recorded**, checkpoint identifier, last applied action, observation age, round-trip time and a small actual action-score distribution. It updates when a result is complete, not every render frame. The distribution is labelled “Policy scores”, not “Probability this move will succeed”, unless that latter quantity is explicitly trained and independently validated.

Expanded view exposes the exact normalised observation, eligible candidates, rejected-result reasons, request/application ticks and per-stage timings. Separate attempted decisions from applied actions, and show whether sampling selected a non-maximum-scoring candidate. Do not substitute fabricated bars for missing output fields. If the pinned SDK does not expose a desired quantity, remove the field or calculate a separately labelled metric from actual logged data.

A session summary reports total eligible boundaries, valid model applications, stale results, timeouts, fallback ticks, warm/cold service state, device/render preset and build/model hashes. All example numbers in design screens or documentation must be marked illustrative. On replay the panel explicitly says “Recorded decisions”; it must not display a false live connection indicator.

A “Pattern response” marker may be shown only when a defined repeated-action detector fired and a recorded model action followed; the detector itself is deterministic telemetry, not proof of cognition. The strongest evidence is an actual replay with the raw decision record and a no-history comparison. Avoid “Laya read your mind” as a technical explanation or an implication that it accessed private inputs.

## 21. Clip capture and social-media production

The main deliverable is a 30–45-second film assembled from the actual browser build. Capture 16:9 at a proposed 1920×1080 master size; compose a separate 9:16 version at 1080×1920. These are production choices, not asserted platform-upload limits. Recheck each platform’s current upload requirements when publishing.

| Segment | Proposed content | Evidence rule |
|---|---|---|
| 0–4 seconds | Recognisable selection close-up; concise “A small decision model controls this opponent” hook | Actual asset and checkpoint; no invented timing |
| 4–14 seconds | One readable live exchange, including a committed block or counter | Do not label a scripted showcase as unedited live combat |
| 14–23 seconds | AI Cam overlay beside the same recorded exchange | Scores and ticks from the corresponding decision log |
| 23–34 seconds | Different player behaviour, a special, cloth/impact close-up in replay | Clearly transition to replay; preserve controller/fiction labels |
| 34–45 seconds | Result, measured technical summary, invitation to try | Separate model latency from end-to-end response and render fps |

Use actual gameplay for the proof segment and replay cameras for the cinematic segment. An attract-mode sequence can be scripted, but it must be labelled as such and not offered as evidence of model skill. Published clips keep “Fictional arcade satire” and the game identity visible, avoid news-style lower thirds and never imply endorsement by the depicted people.

`canvas.captureStream()` captures the canvas image as a media stream; it does not capture arbitrary DOM overlays. The capture path must therefore draw a dedicated export HUD and disclosure into the recorded composition, sharing data with the accessible HTML HUD. Add audio through the game’s export mix. Ensure all textures/video assets are origin-clean or capture can fail. [S11]

Use `MediaRecorder.isTypeSupported()` to choose an available container/codec and handle runtime encoding failure. Do not promise MP4/H.264 on every browser. Provide WebM or another supported output where appropriate and a replay-file fallback. A desktop editing/transcoding stage may be used for the final published video; it is not required for users to play. [S12]

Recording must not degrade the live match unnoticed. Prefer re-rendering the recorded match for high-quality exports and allow 30 fps capture on lower tiers. Report the underlying gameplay frame rate honestly; a 60 fps export does not prove the game ran at 60 fps. In portrait composition, keep both fighters and relevant telegraphs visible; place technical data below the action rather than cropping away one opponent.

## 22. Accessibility, privacy and security

**Accessibility requirements.** Keyboard navigation for every non-combat screen; visible focus; genuine pause/leave controls; remappable gameplay inputs; clear text labels; subtitles for relevant announcer content; independent music/effects controls; camera-shake, flash and haptic toggles; a reduced-motion presentation; and high-contrast HUD options. Do not rely on colour alone for guard levels or player identity. A training slow mode affects both fighters and is excluded from standard benchmark claims.

Target WCAG 2.2 AA for the application shell and document game-specific limitations rather than claiming full accessibility certification. The standard addresses matters such as keyboard access, contrast and flashing; compliance requires testing, not merely adding settings. [S13]

**Privacy requirements.** No microphone, webcam, location or political-profile collection. Leader selection remains local except where strictly necessary to deliver that asset; policy inference does not receive the selection. Optional gameplay analytics are limited to operational/product measures and presented with the appropriate consent/notice for the deployment. Define retention before enabling server-side uploads; default model request logs are redacted diagnostics retained for seven days and local replays remain user-controlled. Do not infer beliefs from opponents selected or results achieved.

**Security requirements.** HTTPS/WSS, short-lived scoped sessions, origin allowlist, message-size limits, replay validation, per-session rate caps, request timeouts, bounded queues, minimum-necessary logs, dependency/asset integrity checks and server-side prompt construction. Restrict public content paths to a manifest; uploaded replays cannot name a remote executable or arbitrary model checkpoint. Public endpoints never expose admin publishing or arbitrary Python execution. Maintain a software/asset bill of materials and lock dependencies at implementation.

The V1 game is client-authoritative and unranked. A modified client can falsify its own score, input history or telemetry. Clearly mark shared client results as unverified; signed server decision receipts prove only what that service received/returned, not the integrity of the browser simulation. A future competitive mode would require authoritative or independently verified match execution. Do not build a global ranking on a client-only trust model.

## 23. Publication, rights and content controls

The release must be reviewed as an original fictional arcade work. Require clearance records for likeness presentation, reference/texture usage, model/animation licences, voice performance, music, logos, fonts, locations and source redistribution. A generic “satire” label is not an all-jurisdiction rights clearance. UK IPO guidance describes limited fair-dealing exceptions for parody, caricature and pastiche; it does not grant blanket permission for all copied assets or uses. Obtain proportionate specialist review for the intended markets and publication model before launch. [S14]

Set a persistent fiction notice in the game and exported footage. Assess applicable synthetic-media disclosure and personality/publicity requirements during release review; ordinary 3D game rendering, generated assets and synthetic voice may raise different questions. This document does not assert that a single watermark satisfies every legal obligation. No authentic voice imitation or generated political statements are needed for the game.

Use original neutral announcer lines, equal mechanical profiles and generic shared specials. Avoid fake quotes, real-election scenarios, claims of actual wrongdoing, political competence scores and celebrations framed as real-world violence. Defeat remains a game outcome. No automatic social posting, political targeting, campaign tie-ins, wagers, hateful custom content or public taunt editor in V1.

Publication controls are versioned: an editor can disable an avatar for future matches, withdraw an unapproved asset, update a source/office label or roll back a roster snapshot without altering the combat model. Retain the content used by private local replays where permitted; a rights withdrawal may instead produce a clearly labelled anonymous replacement on a new export. Do not silently replace provenance.

**Release stopping point:** one documented content/rights review for the approved release pack, plus targeted re-review only for material content or legal changes. Unresolved likeness approval blocks that avatar, not the entire anonymous technical prototype.

## 24. Operations, capacity and production effort

No guarantee of “hundreds of simultaneous players on one GPU” is made. Measure completed independent state decisions/second at the chosen p95 latency, actual state length and candidate count. Conservative admission capacity is `floor(measured_decisions_per_second × headroom / decisions_per_second_per_match)`. Use a default headroom assumption of 0.70 until load tests justify another value. Batch independent matches only after the implementation proves correct batching and tail latency.

Operational dashboards cover warm worker count, admitted sessions, queue age, valid/stale/fallback rate, end-to-end latency, errors and asset loading. Alert when an admitted match can no longer meet the agreed service target. Prefer “AI at capacity — practise against the baseline” to a silently degraded live claim. Readiness must fail while weights are loading. Model fallback is explicit, not an invisible cost-control measure.

**Roles:** product/game director; gameplay engineer; ML engineer; frontend/graphics engineer; character/environment artist; technical animator; sound/VFX support; QA/accessibility support; and producer with specialist rights review. Individuals can cover multiple roles, but coding agents do not replace visual art direction or legal clearance.

`production/work_packages.csv` contains an initial **96–175 person-day planning range** across ten work packages for a polished two-leader public slice. This is an author estimate, not a supplier quote, market-rate claim or promised schedule. It includes two likeness packs and production polish but excludes a full international roster, extensive bespoke mocap, ongoing hosting, paid asset purchases and major research setbacks. Parallel work means person-days must not be read as elapsed days.

The workbook provides editable scope quantities and a formula-based roll-up. Get fixed-scope artist quotes after the first neutral-light head/rig test, not after purchasing dozens of inconsistent character packs. Additional likeness cost scales with reference clearance, sculpting, rig/garment corrections and acceptance—not simply copying a head texture. The first value checkpoint is a good greybox fight; the second is evidence that Laya is viable; only then scale art spend.

## 25. Test plan and release gates

| Gate | Required evidence | Blocking outcome |
|---|---|---|
| G1: Combat | Fixed-tick tests, input buffer tests, trades, guard levels, throws, stamina, combos and reproducible seeds | Infinite chain, render-dependent damage, stuck fighter or biased avatar stats |
| G2: Laya | Held-out evaluation, legal-mask tests, observation-leak tests, latency and history ablation | Hidden future inputs, unlabelled fallback or unsupported capability claims |
| G3: Assets | Both likeness reviews, rig/pose checks, all V1 clips, contact tolerances and browser budgets | Broken expression, cloth penetration in test matrix, failed licence/publication gate |
| G4: Experience | First-use tutorial, AI Cam accuracy, replay checksums, export composition and audio tests | Capture omits disclosure, replay changes decisions or UI hides critical telegraphs |
| G5: Release | Cross-browser matrix, concurrent load, failure recovery, accessibility audit and one rights/content review | Persistent stalls, insecure upload path, unavailable core controls or unapproved assets |

Automate move boundary tests at S, S+1, S+A and S+A+R; attack/hurtbox overlap; insufficient resource rejection; simultaneous collision; facing changes; mirrored input; held guard release; duplicate key suppression; maximum combo length; paired escape; pause/resume and focus loss. Validate asset file sizes, hashes, missing dependencies, joint counts, material counts, morph names and canonical skeleton compatibility.

**AI-specific adversarial fixtures:** a delayed response for an earlier round; repeated request IDs; action not in candidates; an action legal earlier but out of range now; missing scores; scores with NaN; a truncated state; a full queue; an expired token; a model that always chooses the first label; and attempts to inject text into server-constructed instructions. Reordering candidates in a test must not systematically swap semantic decisions.

**Performance tests:** cold load, warm rematch, long idle, ten-minute active session, 20 rematches, repeated roster switches, ten consecutive captures, context loss/recovery, window resize, background/foreground, low-memory mode and constrained bandwidth. Record hardware, browser, build and quality preset. Load tests include idle tabs, disconnects and aborted sessions so abandoned players do not occupy worker slots indefinitely.

**Evidence package:** release checklist, gameplay test report, Laya model card, raw aggregate benchmark data, asset/rights manifests, performance traces, source versions and an unedited model-control demonstration. Sign-offs record who reviewed what; no item is marked passed merely because it is described in this PRD.

## 26. Implementation order and definition of done

The implementation brief in `prompts/codex_build_brief.md` follows the gates rather than attempting an entire high-fidelity game in one pass.

**Step 1:** build the local fixed-step simulator and anonymous greybox fight; produce deterministic test fixtures and the versioned move loader. **Step 2:** implement the baseline controller and recorded action/replay path. **Step 3:** integrate the Laya adapter with the same action interface, delayed observations and schema guards. **Step 4:** run the specialisation/evaluation work and decide on a checkpoint. **Step 5:** load the first complete art pack and fix contact, animation and frame-time issues. **Step 6:** finish the second avatar, arena, settings and AI Cam. **Step 7:** add high-quality replay capture and produce the actual demonstrator. **Step 8:** complete publication and operational gates.

A recommended repository layout is `apps/web`, `services/gateway`, `services/inference`, `packages/combat-core`, `packages/contracts`, `packages/content`, `packages/replay`, `tools/assets`, `tools/evaluation`, `tests/fixtures` and `infra`. Combat core has no React, DOM or model dependency. A baseline adapter and Laya adapter implement the same controller interface. Do not use political identities in training data or policy prompts.

**Global definition of done:** the browser game works without installation on the declared desktop test matrix; two approved likenesses render within budget; all V1 action and animation requirements pass; human input never waits for model inference; model decisions and fallbacks are authentic and inspectable; matches replay without new inference; export includes its labels and audio; controls and settings remain usable; operational admission is measured; and the package’s release evidence has been reviewed.

**Outstanding decisions with defaults:** final cleared title (working title retained); exact first two leaders (select by editorial choice and asset feasibility, not political ranking); art-sourcing supplier (custom shared-rig pipeline); final Laya checkpoint (choose by the held-out test); hosting region/provider (choose by measured latency and deployment requirements); final age/content classification and market permissions (release review). These are explicit production approvals, not missing gameplay definitions.

## 27. Source register and evidence boundaries

Sources were checked on 21 September 2026. Their facts justify specific technology/licensing decisions; the detailed gameplay, asset counts, budgets, acceptance thresholds and production effort estimates are original proposals. Pin exact versions at implementation because documentation and licences can change. No current officeholder directory, asset purchase or trained model has been verified as part of this deliverable.

- **[S01] Laya repository / README:** typed decision interface, published checkpoint descriptions and direct SDK entry point. https://github.com/NandhaKishorM/laya
- **[S02] Laya benchmark report:** author-reported T4 timing, batching conditions and evaluation limitations. https://raw.githubusercontent.com/NandhaKishorM/laya/main/BENCHMARKS.md
- **[S03] Laya model card:** specialisation, calibration caveats and model metadata. https://huggingface.co/convaiinnovations/laya
- **[S04] Three.js WebGLRenderer:** WebGL 2 renderer reference. https://threejs.org/docs/pages/WebGLRenderer.html
- **[S05] Three.js GLTFLoader:** glTF loading and supported compression/extension integration. https://threejs.org/docs/pages/GLTFLoader.html
- **[S06] Khronos glTF 2.0 specification:** coordinates, units, materials, skinning, morphs and animations. https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- **[S07] Three.js KTX2Loader:** Basis/KTX2 texture loading and device transcoding. https://threejs.org/docs/pages/KTX2Loader.html
- **[S08] MDN WebGL best practices:** memory estimation, draw-call/resource practices and graceful adaptation. https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- **[S09] MetaHuman licensing:** cross-engine use and applicable licence conditions. https://www.metahuman.com/license
- **[S10] Adobe Mixamo FAQ:** permitted project uses and service conditions. https://helpx.adobe.com/uk/creative-cloud/faq/mixamo-faq.html
- **[S11] MDN canvas captureStream:** canvas capture behaviour and origin-clean restriction. https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
- **[S12] MDN MediaRecorder.isTypeSupported:** runtime recording-format capability detection. https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static
- **[S13] W3C WCAG 2.2:** accessibility target and relevant interaction/presentation requirements. https://www.w3.org/TR/WCAG22/
- **[S14] UK Intellectual Property Office:** fair-dealing limitations for parody, caricature and pastiche. https://www.gov.uk/guidance/exceptions-to-copyright
- **[S15] Khronos glTF overview:** runtime asset-delivery ecosystem and validation resources. https://www.khronos.org/gltf/
- **[S16] MetaHuman Creator documentation:** digital-human authoring workflow and tool-specific assets. https://dev.epicgames.com/documentation/metahuman/metahuman-creator-in-unreal-engine

**Supporting boundaries.** Khronos provides glTF tooling and validation resources; use them as one export-quality gate, not as proof of visual correctness. [S15] MetaHuman’s authoring workflow produces tool-specific character/rig/material content, which is why any use here includes an explicit conversion and optimisation work package rather than assuming direct browser readiness. [S16]

---

## Appendix A. Handoff inventory

The companion pack contains this PRD in Markdown and Word, an editable production workbook, CSV/JSON asset and animation registers, initial move data, roster coverage placeholders, work-package estimates, normalised JSON Schemas and examples, a Laya policy brief, an implementation brief and a character-artist brief. The workbook and CSVs are planning data; no row is a claim that an asset has been made, bought, licensed, tested or approved.

For implementation, the versioned move data and contracts define machine-readable starting points; requirements in this PRD govern their meaning. Changes to timings, collision rules, perception delay, candidate filtering, export disclosure or content scope require a recorded version change and affected tests. Current asset/version hashes and measured results belong in the eventual release manifests, never in fabricated sample telemetry.

## Appendix B. Requirements traceability

`production/requirements_register.csv` and the workbook Requirements sheet contain 58 identified must-have requirements across experience, combat, Laya, art, replay, operations and publication. IDs carry acceptance criteria, owners, status and the relevant gate. All start as Not started; evidence paths remain blank until implementation and review.
