# Shared implementation boundary
User instructions override source PRD deployment: entirely browser-side, static GitHub Pages. The user supplied a 21-leader roster. Root owns UI/content/assets/integration; agents own files below.

## Combat core (Sol)
Own packages/combat-core/src/** and tests/combat*. Export from index.ts:
- type ActionId string union of PRD V1 move IDs; SpecialId includes the 21 fixed signature IDs (legacy IDs remain in the core register); Difficulty = 'beginner'|'standard'|'expert'.
- createMatch({seed?:number,specials?:[SpecialId,SpecialId],training?:boolean}): MatchState
- stepMatch(state:MatchState, inputs:[ActionId,ActionId]): MatchState (mutable acceptable, document)
- legalActions(state, index:0|1): ActionId[]
- getObservation(state,index,history?): public-only serializable observation
- moves: Record<ActionId,Move> (name,damage,startup,active,recovery,staminaCost,meterCost,reach etc)
- MatchState: tick:number, round:number, phase:'ready'|'fight'|'round-end'|'match-end', phaseTicks:number, timer:number (remaining ticks), fighters:[FighterState,FighterState], wins:[number,number], winner:0|1|'draw'|null, events:CombatEvent[], seed:number
- FighterState: x,y,facing (1|-1), health,stamina,meter,action:ActionId,actionTick:number,stun:number,combo:number, special:SpecialId. Extend as needed.
- CombatEvent: type:string, tick:number, actor:0|1, target?:0|1, damage?:number. Extend as needed. events only latest tick for consumer.
- Public AI observations contain only game state. Signature IDs are normalized to neutral mechanics before serialization; character names and signature titles never enter policy prompts.

## AI (Terra)
Own apps/web/src/ai/**, tools/laya/**, tests/ai*, docs/LAYA_BROWSER.md. Research real Laya and make actual client runtime if feasible; never mislabel baseline.
- BrowserController class or factory exported from ai/index.ts with load(onProgress:(p:LoadProgress)=>void,signal?:AbortSignal):Promise<void>, decide(observation:unknown,legal:ActionId[]):Promise<{action:ActionId,scores?:Record<string,number>,latencyMs:number,source:'laya'|'baseline'}>, dispose()
- export LoadProgress = {progress:number (0..1), stage:string, detail:string}; controller status and checkpoint readable.
- export createBaselineController(difficulty:Difficulty) same decide interface, explicit 'baseline'.
- Can change contract via message before integrating. Root orchestrates delayed snapshots, deadlines, max one in-flight.
- Real model is github.com/NandhaKishorM/laya, huggingface.co/convaiinnovations/laya. Verify browser feasibility. No server or secret keys. User demands genuine client Laya, so attempt export if needed; document real blocker if cannot.

## Renderer (Luna)
Own apps/web/src/game/renderer.ts (+ subordinate renderer modules), apps/web/src/audio/**. Use Three.js 0.180 with individual generated 24-pose photorealistic sprite sets in a 2.5D arena. This direction supersedes the original procedural 3D proposal, which the user rejected. No React, no engine mutation.
- export class ArenaRenderer constructor(container:HTMLElement, options:{playerColor:string,opponentColor:string,playerStyle?:string,opponentStyle?:string,quality?:'high'|'low',reducedMotion?:boolean}); render(state:MatchState,deltaSeconds:number):void; resize():void; dispose():void.
- Design dark charcoal/warm ivory, cyan player, orange AI, brass accents. Stable fighting-plane perspective showing bodies and feet. Arena 14m. Characters canonical 1.82m.
- export class GameAudio from audio/index.ts: unlock():Promise<void>; play(type:string):void; setVolume(volume:number):void; setMuted(muted:boolean):void; dispose():void. Browser Web Audio synthesized original hit/guard/jump/land/parry/special/ui/round-start/round-end cues, no remote files.

Root creates React UI, content roster, generated images, input integration, match controller, replay storage, settings, local Pages publication, docs. Keep final source cohesive, no placeholders presented as finished features.

## Worker and signatures revision

One dedicated combat worker owns both fighters and the fixed tick clock. The UI submits independent semantic input streams and receives ordered frames with the actual applied input pair. Epoch barriers flush prior frames before pause/resume acknowledgments. Rendering and local model inference run independently.

`signatureProfiles` is the shared registry for each character’s fixed move, public mechanics, HUD text, sound cue and effect cue. `signature-release` fires once on the first active tick. The UI cannot select another signature. Current saved replays use format v5 to isolate revised movement, fighter profiles and collision rules.

## Continuous combat revision

`CombatDirector` chooses a legal action from delayed public observations up to every four simulation ticks. Baseline practice uses it alone; the explicitly labelled Laya hybrid additionally supplies real model recommendations. AI Cam distinguishes a model recommendation from the local controller’s executed choice. Only one model query is in flight, with at least 650 ms between starts. Pausing invalidates replies but resuming combat does not wait for the old inference.

`FighterState.velocityX` is deterministic movement state, omitted from public AI observations. Ground acceleration/reversal/braking, carried jump momentum and air steering stay inside the combat worker. Input buffering is eight ticks. The renderer adds cosmetic weight shifts and landing compression without changing collision geometry.

## Fighter builds and contact

`fighterProfiles` defines 21 unique five-stat builds, each using 500 index points across power, speed, vitality, stamina and recovery. `createMatch({fighters:[playerId,opponentId]})` resolves profiles; absent or unknown IDs retain neutral defaults. Worker startup, round resets, HUD maxima and replay reconstruction preserve both profiles. Public AI observations expose numeric health/stamina maxima, never profile identities.

Movement collisions stop approaching bodies without imparting walking force to an idle opponent. Explicit attack knockback remains part of combat.
