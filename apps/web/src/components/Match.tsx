import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Cpu, Download, Pause, Play, RotateCcw, Settings2, Video } from 'lucide-react';
import { createMatch, getObservation, legalActions, moves } from '../../../../packages/combat-core/src';
import type { ActionId, Difficulty, MatchState, SpecialId } from '../../../../packages/combat-core/src';
import type { Character } from '../../../../packages/content/src';
import { CombatDirector } from '../ai/combat-director';
import type { Controller } from '../ai';
import { ArenaRenderer } from '../game/renderer';
import { GameAudio } from '../audio';
import { GameInput, keyLabel } from '../game/input';
import { CombatWorkerClient } from '../game/combat-worker-client';
import type { CombatFrameBatch } from '../game/combat-worker-client';
import { decisionTiming } from '../game/ai-timing';
import { downloadBlob, saveReplay } from '../game/replay';
import type { ReplayData } from '../game/replay';
import type { Settings } from '../settings';
interface Props {player:Character;opponent:Character;specials:[SpecialId,SpecialId];difficulty:Difficulty;mode:'laya'|'baseline';controller:Controller|null;settings:Settings;training:boolean;overlayOpen?:boolean;replay?:ReplayData;onExit:()=>void;onEnd:(replay:ReplayData)=>void;onSettings:()=>void}
interface Telemetry {action:string;source:string;origin:string;reason:string;modelAction:string;distance:number;opponentAction:string;opponentHealth:number;opponentHeight:number;contextAge:number;reflexes:number;latency:number;age:number;attempted:number;applied:number;rejected:number;scores:Record<string,number>;error:string}
function initialTelemetry(source:string):Telemetry{return {action:'idle',source,origin:'combat',reason:'Waiting for the opening bell',modelAction:'Awaiting model',distance:0,opponentAction:'idle',opponentHealth:1000,opponentHeight:0,contextAge:0,reflexes:0,latency:0,age:0,attempted:0,applied:0,rejected:0,scores:{},error:''};}
const HELD = new Set<ActionId>(['advance','retreat','guard_high','guard_low','crouch','idle']);
export function Match(props:Props){
  const stage=useRef<HTMLDivElement>(null);const api=useRef<{pause:()=>void;resume:()=>void;reset:()=>void;retryModel:()=>void;input:GameInput;record:()=>void}|null>(null);
  const latest=useRef(props);latest.current=props;
  const [state,setState]=useState(()=>createMatch({seed:props.replay?.seed??42,fighters:[props.player.id,props.opponent.id],specials:props.specials,training:props.training}));
  const pauseDialog=useRef<HTMLDialogElement>(null);
  const [roundOutcome,setRoundOutcome]=useState<0|1|'draw'|null>(null);const [replayFinished,setReplayFinished]=useState(false);const [preparing,setPreparing]=useState(true);const [paused,setPaused]=useState(false);const [error,setError]=useState('');const [showCam,setShowCam]=useState(false);const [toast,setToast]=useState('');const [recording,setRecording]=useState(false);const [notice,setNotice]=useState('');const [replayProgress,setReplayProgress]=useState(0);
  const [telemetry,setTelemetry]=useState<Telemetry>(()=>initialTelemetry(props.replay?'recorded':props.mode));
  const audio=useRef<GameAudio|null>(null);
  useEffect(()=>{if(props.overlayOpen)api.current?.pause();},[props.overlayOpen]);
  useEffect(()=>{if(paused||error)pauseDialog.current?.showModal();else pauseDialog.current?.close();},[paused,error]);
  useEffect(()=>{audio.current?.setVolume(props.settings.volume);audio.current?.setMuted(props.settings.muted);if(api.current)api.current.input.bindings=props.settings.bindings;},[props.settings]);
  useEffect(() => {
    if (!stage.current) return;
    if (props.mode === 'laya' && !props.controller && !props.replay && !props.training) {
      setPreparing(false);
      setError('Laya is not initialized. Return to model initialization and load the controller.');
      return;
    }
    let renderer: ArenaRenderer;
    try {
      renderer = new ArenaRenderer(stage.current, { playerColor: '#8bd4dd', opponentColor: '#ec9f59', playerStyle: props.player.id, opponentStyle: props.opponent.id, quality: props.settings.quality, reducedMotion: props.settings.reducedMotion });
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start WebGL 2.'); return; }
    const sounds = new GameAudio(); audio.current = sounds;
    sounds.setVolume(props.settings.volume); sounds.setMuted(props.settings.muted); void sounds.unlock();
    const input = new GameInput(props.settings.bindings);
    const controller = props.controller;
    const localMode = props.replay?.controller ?? props.mode;
    const seed = props.replay?.seed ?? ((Date.now() >>> 0) || 42);
    const fighterIds: [string, string] = [props.player.id, props.opponent.id];
    const startOptions = { seed, fighters: fighterIds, specials: props.specials, training: props.training, replayInputs: props.replay?.inputs, snapshotBatchTicks: 1 };
    let simulation = createMatch(startOptions);
    let snapshots: MatchState[] = [simulation]; let history: { tick: number; action: ActionId }[] = []; let inputs: [ActionId, ActionId][] = [];
    let alive = true, prepared = false, isPaused = false, ended = false, resetting = false;
    const director = new CombatDirector(props.difficulty, seed);
    let policyEpoch = 0, pending = false, pendingSince = 0, request = 0, lastSchedule = -999, lastReflex = -999;
    let aiAction: ActionId = 'idle'; let failureSince: number | null = null;
    let modelHealth: 'healthy'|'recovering'|'unavailable' = 'healthy'; let recoveryAttempts = 0; let recoveryInFlight = false; let lastModelError = '';
    let stats = initialTelemetry(props.replay ? 'recorded' : localMode);
    let previousTime = performance.now(), lastHud = 0, lastToast = 0, raf = 0, replayIndex = 0;
    let media: MediaRecorder | null = null, clipParts: Blob[] = [], captureCanvas: HTMLCanvasElement | null = null;
    let clipTimer: ReturnType<typeof setTimeout> | undefined;
    let barrier: Promise<unknown> = Promise.resolve();
    const combat = new CombatWorkerClient({ onFrames: consumeFrames, onError: failCombat });
    function failCombat(e: Error) { if (!alive) return; setError(e.message); isPaused = true; setPaused(true); }
    function transition(operation: () => Promise<MatchState>) {
      barrier = barrier.then(() => alive ? operation() : undefined).then(next => {
        if (alive && next) { simulation = next; setState(next); }
      }).catch(e => { if (alive) failCombat(e instanceof Error ? e : new Error(String(e))); });
    }
    function invalidateInference(cancelPending = false) {
      policyEpoch++;
      // Context changes make the current reply stale, but they do not cancel
      // the controller's promise. Keep one actual request in flight so the
      // single-flight worker is not immediately hit with decision-in-flight.
      // Worker replacement is the one explicit cancellation path.
      if (cancelPending) { request++; pending = false; pendingSince = 0; }
      director.reset(); lastReflex = -999;
      aiAction = 'idle';
    }
    async function recoverLaya(trigger: string): Promise<void> {
      if (localMode !== 'laya' || !controller || recoveryInFlight || modelHealth === 'unavailable') return;
      if (!controller.recover) {
        modelHealth = 'unavailable'; lastModelError = 'The active Laya controller does not support worker recovery.';
        stats.error = `Laya unavailable · combat active · ${lastModelError}`; setTelemetry({ ...stats }); return;
      }
      recoveryInFlight = true; modelHealth = 'recovering'; failureSince = null; invalidateInference(true); lastSchedule = -999;
      stats.error = `Laya reconnecting · combat active · ${trigger}`; setTelemetry({ ...stats });
      while (recoveryAttempts < 2 && alive) {
        recoveryAttempts++;
        try {
          await controller.recover((progress) => {
            if (!alive) return;
            stats.error = `Laya reconnecting · combat active · ${progress.stage}: ${progress.detail}`;
            setTelemetry({ ...stats });
          });
          if (!alive) return;
          recoveryInFlight = false; modelHealth = 'healthy'; failureSince = null; lastModelError = ''; stats.error = '';
          lastSchedule = -999; setTelemetry({ ...stats }); return;
        } catch (error) {
          if (!alive) return;
          lastModelError = error instanceof Error ? error.message : String(error);
          stats.error = `Laya reconnecting · combat active · ${lastModelError}`; setTelemetry({ ...stats });
        }
      }
      if (!alive) return;
      recoveryInFlight = false; modelHealth = 'unavailable';
      stats.error = `Laya unavailable · combat active · ${lastModelError || trigger}`; setTelemetry({ ...stats });
    }
    function retryModel() {
      if (recoveryInFlight || localMode !== 'laya') return;
      recoveryAttempts = 0; modelHealth = 'healthy';
      void recoverLaya('Manual retry requested.');
    }
    function pause() {
      if (!alive) return;
      isPaused = true; invalidateInference(); input.clear(); setPaused(true);
      if (prepared) transition(() => combat.pause());
    }
    function resume() {
      if (!alive || ended) return;
      isPaused = false; invalidateInference();
      input.clear(); setPaused(false); previousTime = performance.now(); void sounds.unlock();
      if (prepared) transition(() => combat.resume());
    }
    function reset() {
      if (resetting || !alive || !prepared) return;
      resetting = true; invalidateInference(); input.clear(); ended = false;
      snapshots = []; history = []; inputs = []; replayIndex = 0; lastSchedule = -999;
      setReplayFinished(false); setReplayProgress(0); setRoundOutcome(null); setNotice('');
      isPaused = false; setPaused(false);
      barrier = barrier.then(async () => {
        if (!alive) return;
        simulation = await combat.reset(startOptions);
        snapshots = [simulation]; resetting = false; setState(simulation);
      }).catch(e => { if (alive) failCombat(e instanceof Error ? e : new Error(String(e))); });
    }
    function record() {
      if (media?.state === 'recording') { media.stop(); return; }
      if (!prepared) return;
      if (typeof MediaRecorder === 'undefined' || !renderer.canvas.captureStream) { setNotice('Video capture is unavailable in this browser. You can still download replay data.'); return; }
      try {
        void sounds.unlock(); captureCanvas = document.createElement('canvas');
        captureCanvas.width = renderer.canvas.width; captureCanvas.height = renderer.canvas.height;
        const stream = captureCanvas.captureStream(30);
        sounds.getCaptureStream().getAudioTracks().forEach(track => stream.addTrack(track));
        const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
        media = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); clipParts = [];
        media.ondataavailable = event => { if (event.data.size) clipParts.push(event.data); };
        media.onstop = () => {
          clearTimeout(clipTimer); const type = media?.mimeType ?? 'video/webm';
          downloadBlob(new Blob(clipParts, { type }), `wst-fictional-${localMode}-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
          stream.getVideoTracks().forEach(track => track.stop()); captureCanvas = null;
          if (alive) setRecording(false);
        };
        media.start(200); setRecording(true);
        clipTimer = setTimeout(() => { if (media?.state === 'recording') media.stop(); }, 60_000);
      } catch (e) { setNotice(`Capture unavailable: ${e instanceof Error ? e.message : 'unknown error'}`); }
    }
    api.current = { pause, resume, reset, retryModel, input, record };
    const perceptionDelay = props.difficulty === 'beginner' ? 18 : props.difficulty === 'expert' ? 9 : 12;
    function observedContext() {
      const snapshot = snapshots.find(s => s.tick === simulation.tick - perceptionDelay);
      if (!snapshot || snapshot.phase !== 'fight') return null;
      return { snapshot, observation: getObservation(snapshot, 1, history.filter(item => item.tick <= snapshot.tick).slice(-8).map(item => item.action)) };
    }
    function updateCombatController() {
      if (props.replay || props.training || isPaused || ended || simulation.phase !== 'fight' || simulation.hitstop || simulation.tick - lastReflex < 4) return;
      const context = observedContext();
      if (!context) return;
      const currentLegal = legalActions(simulation, 1);
      const legal = legalActions(context.snapshot, 1).filter(action => currentLegal.includes(action));
      if (legal.length < 2) return;
      lastReflex = simulation.tick;
      const decision = director.choose(context.observation, legal);
      aiAction = decision.action;
      stats = { ...stats, action: decision.action, origin: decision.origin, reason: decision.reason, reflexes: stats.reflexes + 1,
        distance: context.observation.distanceMm, opponentAction: context.observation.opponent.action,
        opponentHealth: context.observation.opponent.health, opponentHeight: context.observation.opponent.yMm,
        contextAge: simulation.tick - context.snapshot.tick };
    }
    function schedule() {
      if (localMode !== 'laya' || !controller || modelHealth !== 'healthy' || recoveryInFlight) return;
      const timing = decisionTiming(localMode, controller.checkpoint.lastLatencyMs);
      if (props.replay || props.training || isPaused || simulation.phase !== 'fight' || simulation.hitstop || pending || simulation.tick - lastSchedule < timing.cadenceTicks) return;
      const context = observedContext();
      if (!context || legalActions(context.snapshot, 1).length < 2) return;
      const {snapshot, observation} = context;
      const legal = legalActions(snapshot, 1);
      const requestTick = simulation.tick, round = simulation.round, epoch = policyEpoch, id = ++request, begin = performance.now();
      pending = true; pendingSince = begin; lastSchedule = requestTick; stats.attempted++;
      controller.decide(observation, legal).then(decision => {
        if (!alive || epoch !== policyEpoch || round !== simulation.round) return;
        const age = simulation.tick - requestTick, elapsed = performance.now() - begin;
        const valid = !isPaused && id === request && simulation.phase === 'fight' && age <= timing.expiryTicks && elapsed <= timing.expiryMs && legal.includes(decision.action) && Number.isFinite(decision.latencyMs);
        if (!valid) { stats.rejected++; failureSince ??= performance.now(); return; }
        // This is model advice, not a held engine command. The fast controller
        // checks the latest delayed context before applying any recommendation.
        director.acceptModel(decision, snapshot.tick, round);
        stats = { ...stats, modelAction: decision.action, latency: Math.round(elapsed), age: simulation.tick - snapshot.tick, applied: stats.applied + 1, scores: decision.scores ?? {}, error: '' };
        failureSince = null;
      }).catch(e => {
        if (!alive || epoch !== policyEpoch) return;
        stats.rejected++; stats.error = e instanceof Error ? e.message : 'Decision failed'; failureSince ??= performance.now();
      }).finally(() => { if (id === request) pending = false; });
    }
    function consumeFrames(batch: CombatFrameBatch) {
      if (!alive || resetting) return;
      for (const frame of batch.frames) {
        const previous = simulation; simulation = frame.state;
        if (props.replay) replayIndex++; else if (!props.training) inputs.push(frame.inputs);
        if (simulation.round !== previous.round) {
          invalidateInference(); history = []; snapshots = [];
        }
        snapshots.push(simulation); if (snapshots.length > 40) snapshots.shift();
        renderer.consumeFrame(simulation);
        for (let index = 0; index < 2; index++) {
          const before = previous.fighters[index], after = simulation.fighters[index];
          if (before.y > 0 && after.y === 0) sounds.play('land');
          if (after.y === 0 && Math.abs(after.x - before.x) > .001 && simulation.tick % 14 === 0) sounds.play('step');
        }
        for (const event of simulation.events) {
          if (event.type === 'round-end' && event.outcome !== undefined) setRoundOutcome(event.outcome);
          if (event.type === 'action-start' && event.action) {
            if (event.actor === 0) { history.push({ tick: simulation.tick, action: event.action }); history = history.slice(-32); }
            if (event.action === simulation.fighters[event.actor].special) sounds.play('signature-charge');
            else if (moves[event.action].damage > 0) sounds.play(`swing.${event.action}`);
            else sounds.play(event.action);
          } else if (event.type === 'signature-release') {
            sounds.playSignature(event.actor === 0 ? props.player.id : props.opponent.id);
          } else if (event.type === 'hit' && event.action) sounds.play(moves[event.action].meterCost > 0 ? 'heavy-hit' : `${event.action}-hit`);
          else sounds.play(event.type === 'fight' ? 'round-start' : event.type === 'shield-absorb' ? 'guard' : event.type);
          if (['counter-hit', 'guard-break', 'parry', 'throw-break'].includes(event.type)) { setToast(event.type.replaceAll('-', ' ').toUpperCase()); lastToast = performance.now(); }
          if (event.combo && event.combo > 1) { setToast(`${event.combo} HIT COMBO`); lastToast = performance.now(); }
        }
        updateCombatController();
        schedule();
      }
      if (props.replay && batch.replayEnded) {
        ended = true; isPaused = true; setReplayFinished(true); setPaused(true); setNotice('Replay complete. Restart or return to the delegation.');
      } else if (batch.terminal && !props.replay) {
        if (props.training) { reset(); return; }
        if (ended) return; ended = true;
        const data: ReplayData = { version: 5, id: `${seed.toString(36)}-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), seed, player: props.player.id, opponent: props.opponent.id, specials: props.specials, controller: localMode, inputs, winner: simulation.winner, wins: simulation.wins };
        if (!saveReplay(data)) setNotice('Storage unavailable; replay data remains available for this session.');
        if (media?.state === 'recording') media.stop(); latest.current.onEnd(data);
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input,select,textarea,dialog,.arena-radio')) return;
      if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) isPaused ? resume() : pause(); return; }
      if (event.code === 'KeyC') { if (!event.repeat) setShowCam(value => !value); return; }
      if (isPaused || props.replay) return;
      if (Object.values(input.bindings).includes(event.code)) { event.preventDefault(); input.down(event.code, event.repeat); void sounds.unlock(); }
    };
    const onKeyUp = (event: KeyboardEvent) => input.up(event.code);
    const onBlur = () => { if (!ended) pause(); };
    const onVisibility = () => { if (document.hidden) onBlur(); };
    const observer = new ResizeObserver(() => renderer.resize()); observer.observe(stage.current);
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', onBlur); document.addEventListener('visibilitychange', onVisibility);
    barrier = renderer.ready.then(async () => {
      if (!alive) return;
      simulation = await combat.start(startOptions); snapshots = [simulation]; prepared = true;
      setPreparing(false); setState(simulation); if (isPaused) await combat.pause();
    }).catch(e => { if (alive) { setPreparing(false); failCombat(e instanceof Error ? e : new Error(String(e))); } });
    function frame(now: number) {
      if (!alive) return;
      const delta = Math.min((now - previousTime) / 1_000, .05); previousTime = now;
      if (prepared && !isPaused && !ended && !resetting && !props.replay) {
        const pair: [ActionId, ActionId] = [input.consume(simulation), props.training ? 'idle' : aiAction];
        const heldInputs: [ActionId, ActionId] = [
          input.heldAction(simulation),
          props.training || !HELD.has(aiAction) ? 'idle' : aiAction,
        ];
        combat.submit(pair, heldInputs); if (!HELD.has(aiAction)) aiAction = 'idle';
      }
      if (localMode === 'laya' && modelHealth === 'healthy' && !recoveryInFlight && ((pending && now - pendingSince > 30_000) || (failureSince !== null && now - failureSince > 30_000))) {
        void recoverLaya(pending ? 'Decision exceeded the 30-second watchdog.' : (stats.error || 'Repeated model decisions failed.'));
      }
      try { renderer.render(simulation, isPaused || ended || simulation.hitstop > 0 ? 0 : delta); } catch (e) { failCombat(e instanceof Error ? e : new Error('Graphics context lost.')); if (prepared) transition(() => combat.pause()); }
      if (captureCanvas) {
        const context = captureCanvas.getContext('2d');
        if (context) {
          context.drawImage(renderer.canvas, 0, 0); const w = captureCanvas.width, h = captureCanvas.height;
          context.fillStyle = '#0b101de0'; context.fillRect(0, 0, w, 60); context.fillRect(0, h - 38, w, 38);
          context.fillStyle = '#eee'; context.font = 'bold 18px sans-serif'; context.textAlign = 'left'; context.fillText(`${props.player.name} · ${simulation.fighters[0].health} HP`, 22, 37);
          context.textAlign = 'right'; context.fillText(`${props.opponent.name} · ${simulation.fighters[1].health} HP`, w - 22, 37);
          context.textAlign = 'center'; context.fillText(props.training ? '∞' : String(Math.ceil(simulation.timer / 60)), w / 2, 37);
          context.font = '14px sans-serif'; context.fillStyle = '#e9c493'; context.fillText(`WST · FICTIONAL ARCADE SATIRE · ${localMode === 'laya' ? 'LAYA + COMBAT' : 'BASELINE'} CONTROLLER${props.replay ? ' · RECORDED REPLAY' : ''}`, w / 2, h - 14);
        }
      }
      if (now - lastHud > 80) { setState(simulation); setTelemetry({ ...stats }); if (props.replay) setReplayProgress(replayIndex / Math.max(1, props.replay.inputs.length)); lastHud = now; }
      if (lastToast && now - lastToast > 950) { setToast(''); lastToast = 0; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false; policyEpoch++; clearTimeout(clipTimer); if (media?.state === 'recording') media.stop();
      cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVisibility);
      combat.dispose(); input.clear(); renderer.dispose(); sounds.dispose(); audio.current = null; api.current = null;
    };
  }, []);
  const pause=()=>{api.current?.pause();};const resume=()=>api.current?.resume();
  function touch(code:string,down:boolean){if(down){api.current?.input.down(code);void audio.current?.unlock();}else api.current?.input.up(code);}
  return <main className="match-screen"><div ref={stage} className="arena-container"/>
    <div className="hud"><Health fighter={state.fighters[0]} character={props.player} wins={state.wins[0]}/><div className="hud-clock"><strong>{props.training?'∞':Math.ceil(state.timer/60)}</strong><span>ROUND {state.round}</span></div><Health fighter={state.fighters[1]} character={props.opponent} wins={state.wins[1]} opponent/></div>
    <div className="match-topline"><span>{props.training?'TRAINING / IDLE DUMMY':props.replay?'RECORDED REPLAY':telemetry.source==='laya'?`LAYA + COMBAT / ${props.controller?.checkpoint.provider?.toUpperCase()??'LOCAL'}`:'BASELINE PRACTICE'}{telemetry.source==='laya'&&telemetry.error?` · ${telemetry.error.startsWith('Laya unavailable')?'LAYA UNAVAILABLE · COMBAT ACTIVE':'LAYA RECONNECTING · COMBAT ACTIVE'}`:''} · FICTIONAL SATIRE</span><div className="match-buttons"><button onClick={()=>setShowCam(x=>!x)} aria-pressed={showCam}><Cpu size={13}/> AI CAM <kbd>C</kbd></button><button onClick={()=>api.current?.record()}><Video size={13}/>{recording?'STOP CLIP':'RECORD CLIP'}</button><button onClick={pause} aria-label="Pause match"><Pause size={14}/></button></div></div>
    {preparing&&!error&&<div className="center-message" role="status"><strong>ASSEMBLING…</strong><span>LOADING FIGHTER ARTWORK & ARENA</span></div>}
    {!preparing&&!paused&&state.phase==='ready'&&<div className="center-message"><strong>ROUND {state.round}</strong><span>MAKE YOUR OPENING STATEMENT</span></div>}
    {!paused&&state.phase==='round-end'&&<div className="center-message"><strong>{roundOutcome==='draw'?'DRAW':roundOutcome===0?'ROUND WON':'ROUND LOST'}</strong><span>THE NEXT SESSION BEGINS SHORTLY</span></div>}
    {toast&&<div className="combat-toast" role="status">{toast}</div>}
    {showCam&&<aside className="ai-cam"><h3>AI CAM <span>{telemetry.source==='laya'?'LAYA + COMBAT':telemetry.source.toUpperCase()}</span></h3><p>{props.training?'The training dummy is idle.':props.replay?'Playing recorded inputs. Inference is disabled.':'Local reactions refresh up to 15 times per second using delayed public state.'}</p>{telemetry.source==='laya'&&telemetry.error&&<p role="alert">Last Laya error: {telemetry.error}</p>}<dl><dt>Current move</dt><dd>{state.fighters[1].action}</dd><dt>Controller choice</dt><dd>{telemetry.action}</dd><dt>Chosen by</dt><dd>{telemetry.origin==='model'?'Laya advice':'Combat controller'}</dd><dt>Reason</dt><dd>{telemetry.reason}</dd><dt>Watching</dt><dd>{props.player.surname}</dd><dt>Your distance / HP</dt><dd>{(telemetry.distance/1000).toFixed(2)} m / {telemetry.opponentHealth}</dd><dt>Your visible action</dt><dd>{telemetry.opponentAction}{telemetry.opponentHeight>0?' · airborne':''}</dd><dt>Perception delay</dt><dd>{Math.round(telemetry.contextAge*1000/60)} ms</dd><dt>Local decisions</dt><dd>{telemetry.reflexes}</dd></dl>{telemetry.source==='laya'&&<><p>Laya advises the combat controller. Your keyboard inputs remain private.</p><dl><dt>Model recommendation</dt><dd>{telemetry.modelAction}</dd><dt>Model latency</dt><dd>{telemetry.latency} ms</dd><dt>Model requests / replies</dt><dd>{telemetry.attempted} / {telemetry.applied}</dd><dt>Rejected replies</dt><dd>{telemetry.rejected}</dd></dl>{telemetry.error.startsWith('Laya unavailable')&&<button className="secondary-button" onClick={()=>api.current?.retryModel()}>RETRY LAYA</button>}</>}{Object.keys(telemetry.scores).length>0&&<><p>Model preferences · not win probabilities</p>{Object.entries(telemetry.scores).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,value])=><div className="score-item" key={name}><span>{name}<b>{value.toFixed(2)}</b></span><div><i style={{width:`${Math.max(0,Math.min(1,value))*100}%`}}/></div></div>)}</>}</aside>}
    <div className="match-bottom"><Meter value={state.fighters[0].meter} special={props.specials[0]}/><div className="fight-controls"><span><kbd>{keyLabel(props.settings.bindings.left)} {keyLabel(props.settings.bindings.right)}</kbd> MOVE</span><span><kbd>{keyLabel(props.settings.bindings.jump)}</kbd> JUMP</span><span><kbd>{keyLabel(props.settings.bindings.light)}</kbd> LIGHT</span><span><kbd>{keyLabel(props.settings.bindings.heavy)}</kbd> HEAVY</span><span><kbd>{keyLabel(props.settings.bindings.guard)}</kbd> GUARD</span><span><kbd>{keyLabel(props.settings.bindings.special)}</kbd> SPECIAL</span></div><Meter value={state.fighters[1].meter} special={props.specials[1]} opponent/></div>
    {!props.replay&&<div className="touch-controls" aria-label="Experimental touch controls"><div>{[['left','←'],['right','→'],['jump','↑'],['crouch','↓']].map(([key,label])=><button key={key} aria-label={key} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);touch(props.settings.bindings[key],true);}} onPointerUp={()=>touch(props.settings.bindings[key],false)} onPointerCancel={()=>touch(props.settings.bindings[key],false)}>{label}</button>)}</div><div>{[['light','J'],['heavy','K'],['guard','G'],['special','O']].map(([key,label])=><button key={key} aria-label={key} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);touch(props.settings.bindings[key],true);}} onPointerUp={()=>touch(props.settings.bindings[key],false)} onPointerCancel={()=>touch(props.settings.bindings[key],false)}>{label}</button>)}</div></div>}
    {props.replay&&<div className="replay-indicator">RECORDED <progress max={1} value={replayProgress}/><button onClick={()=>api.current?.reset()} aria-label="Restart replay"><RotateCcw size={14}/></button></div>}
    {(paused||error)&&<div className="pause-layer"><dialog ref={pauseDialog} className="pause-panel" aria-label="Match paused" onCancel={e=>{e.preventDefault();if(!error&&!replayFinished)resume();}}><div className="eyebrow">THE SUMMIT / INTERMISSION</div><h2>{replayFinished?'REPLAY COMPLETE':error?'GRAPHICS PAUSED':'TAKE A BREATHER.'}</h2><p>{error||notice||'The clock is stopped. Your next move can wait.'}</p>{!error&&!replayFinished&&<button className="primary-button" onClick={resume}><Play size={16}/> RESUME</button>}{(props.training||props.replay)&&<button className="secondary-button" onClick={()=>{setNotice('');api.current?.reset();}}><RotateCcw size={15}/> {props.replay?'RESTART REPLAY':'RESET TRAINING'}</button>}<button className="secondary-button" onClick={props.onSettings}><Settings2 size={15}/> SETTINGS</button><button className="text-button" onClick={props.onExit}><ArrowLeft size={14}/> RETURN TO DELEGATION</button></dialog></div>}
    {notice&&!paused&&<div className="capture-notice" role="status"><span>{notice}</span><button onClick={()=>setNotice('')}>Dismiss</button></div>}
  </main>;
}
function Health({fighter,character,wins,opponent=false}:{fighter:MatchState['fighters'][0];character:Character;wins:number;opponent?:boolean}){return <div className={`hud-fighter ${opponent?'opponent':''}`}><div className="hud-name"><strong>{character.surname}</strong><span>{opponent?'AI':'PLAYER 01'}</span></div><div className="health-track"><div className="health-fill" style={{width:`${100*fighter.health/fighter.maxHealth}%`}}/></div><div className="stamina-track"><div className="stamina-fill" style={{width:`${100*fighter.stamina/fighter.maxStamina}%`}}/></div><div className="hud-meta"><span>{fighter.health} / {fighter.maxHealth.toLocaleString()} HP</span><div className="round-dots">{[0,1].map(i=><i key={i} className={wins>i?'won':''}/>)}</div></div></div>;}
function Meter({value,special,opponent=false}:{value:number;special:SpecialId;opponent?:boolean}){return <div className={`meter-box ${opponent?'ai':''} ${value===100?'meter-full':''}`}><div className="meter-label"><span>{moves[special].name.toUpperCase()}</span><strong>{value}%</strong></div><div className="meter-track"><div className="meter-fill" style={{width:`${value}%`}}/></div><small>{value===100?'SPECIAL READY':'BUILD METER BY LANDING STRIKES'}</small></div>;}
