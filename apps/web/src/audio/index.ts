import { publicAssetUrl } from '../assets';

type AudioContextWithWebkit = typeof AudioContext & { new (): AudioContext };

type FilterKind = BiquadFilterType;

interface NoiseOptions {
  duration: number;
  gain: number;
  frequency: number;
  filter?: FilterKind;
  q?: number;
  highFrequency?: number;
  offset?: number;
  pan?: number;
}

interface ToneOptions {
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
  attack?: number;
  release?: number;
  detune?: number;
  pan?: number;
}

type RecordedCue = 'light' | 'body' | 'heavy' | 'guard' | 'step' | 'land' | 'cloth' | 'whoosh';

/**
 * Small, local CC0 layer. These are fetched and decoded once after unlock;
 * the procedural layer remains the fallback when a file or decoder is absent.
 */
const RECORDED_SAMPLES: Record<RecordedCue, string[]> = {
  light: ['/audio/impact-light.ogg'],
  body: ['/audio/impact-body-a.ogg', '/audio/impact-body-b.ogg'],
  heavy: ['/audio/impact-heavy-a.ogg', '/audio/impact-heavy-b.ogg'],
  guard: ['/audio/impact-guard.ogg'],
  step: ['/audio/step-wood-a.ogg', '/audio/step-wood-b.ogg'],
  land: ['/audio/land-concrete.ogg'],
  cloth: ['/audio/cloth-a.ogg', '/audio/cloth-b.ogg'],
  whoosh: ['/audio/whoosh-cloth.ogg'],
};

type SignatureTexture = 'brass' | 'stone' | 'ice' | 'pulse' | 'stomp' | 'glass' | 'velvet' | 'air' | 'sand' | 'wood' | 'ledger' | 'equation' | 'ink' | 'guard' | 'gold' | 'harbor' | 'wild' | 'crystal' | 'command';

interface SignatureRecipe {
  id: string;
  root: number;
  texture: SignatureTexture;
  color: string;
  pan: number;
}

const SIGNATURE_RECIPES: Record<string, SignatureRecipe> = {
  trump: { id: 'trump', root: 72, texture: 'brass', color: '#c99b48', pan: -0.12 },
  xi: { id: 'xi', root: 58, texture: 'stone', color: '#3f6287', pan: 0.12 },
  putin: { id: 'putin', root: 92, texture: 'ice', color: '#94c4d2', pan: -0.08 },
  modi: { id: 'modi', root: 126, texture: 'pulse', color: '#d29a50', pan: 0.08 },
  burnham: { id: 'burnham', root: 66, texture: 'stomp', color: '#a65a58', pan: -0.15 },
  macron: { id: 'macron', root: 184, texture: 'glass', color: '#9dc4ce', pan: 0.1 },
  merz: { id: 'merz', root: 54, texture: 'stone', color: '#aeb5bd', pan: -0.06 },
  meloni: { id: 'meloni', root: 112, texture: 'velvet', color: '#b56b9f', pan: 0.16 },
  takaichi: { id: 'takaichi', root: 158, texture: 'crystal', color: '#cda97d', pan: -0.1 },
  mbs: { id: 'mbs', root: 98, texture: 'sand', color: '#dfc88d', pan: 0.13 },
  erdogan: { id: 'erdogan', root: 71, texture: 'brass', color: '#6f8aa5', pan: -0.18 },
  lula: { id: 'lula', root: 84, texture: 'wood', color: '#a97050', pan: 0.15 },
  carney: { id: 'carney', root: 118, texture: 'ledger', color: '#80b2b5', pan: -0.14 },
  sheinbaum: { id: 'sheinbaum', root: 136, texture: 'equation', color: '#b77d9d', pan: 0.14 },
  lee: { id: 'lee', root: 102, texture: 'ink', color: '#91b3c0', pan: -0.11 },
  prabowo: { id: 'prabowo', root: 62, texture: 'guard', color: '#967c50', pan: 0.09 },
  ramaphosa: { id: 'ramaphosa', root: 76, texture: 'gold', color: '#c99d56', pan: -0.13 },
  albanese: { id: 'albanese', root: 86, texture: 'harbor', color: '#82aeba', pan: 0.12 },
  milei: { id: 'milei', root: 48, texture: 'wild', color: '#9d7bc3', pan: -0.2 },
  'von-der-leyen': { id: 'von-der-leyen', root: 142, texture: 'crystal', color: '#d3b379', pan: 0.17 },
  kim: { id: 'kim', root: 52, texture: 'command', color: '#576b76', pan: -0.17 },
};

/**
 * Original Web Audio foley for the arena. The sound is made from prewarmed
 * noise beds, shaped transients, tuned body resonances and short fabric/shoe
 * layers; it owns no remote files and never synthesizes speech.
 */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private captureDestination: MediaStreamAudioDestinationNode | null = null;
  private readonly activeVoices = new Set<AudioScheduledSourceNode>();
  private readonly noiseBeds = new Map<string, AudioBuffer>();
  private readonly recordedBuffers = new Map<string, AudioBuffer>();
  private readonly maxVoices = 64;
  private activeSignatureId: string | null = null;
  private volume = 0.78;
  private muted = false;
  private unlocked = false;
  private disposed = false;
  private randomState = 0x4d595df;
  private recordedLoad: Promise<void> | null = null;
  private recordedReady = false;

  async unlock(): Promise<void> {
    if (this.disposed) return;
    this.ensureGraph();
    if (!this.context) return;
    this.preloadBeds();
    try {
      await this.context.resume();
      this.unlocked = this.context.state === 'running';
      this.updateMasterGain();
      if (this.unlocked) await this.preloadRecordedSamples();
    } catch {
      this.unlocked = false;
    }
  }

  play(type: string): void {
    if (!this.unlocked || this.disposed) return;
    const name = type.toLowerCase().replace(/[._\s]+/g, '-');
    const signatureId = this.signatureIdFrom(name);
    if (signatureId) {
      this.signature(signatureId);
      return;
    }
    if (name === 'signature' || name === 'signature-special') {
      if (this.activeSignatureId) this.signature(this.activeSignatureId);
      return;
    }
    if (name === 'signature-charge' || name === 'charge-signature') {
      this.signatureCharge();
      return;
    }
    if (name === 'step' || name === 'footstep' || name === 'foot-step') {
      this.step();
      return;
    }
    if (name.startsWith('swing-')) {
      this.swing(name.slice('swing-'.length));
      return;
    }
    switch (name) {
      case 'hit':
      case 'impact':
      case 'strike-hit':
      case 'damage':
        this.strike('light');
        break;
      case 'light':
        this.swing('light');
        break;
      case 'body':
        this.swing('body');
        break;
      case 'heavy':
        this.swing('heavy');
        break;
      case 'low':
        this.swing('low');
        break;
      case 'overhead':
        this.swing('overhead');
        break;
      case 'anti-air':
        this.swing('anti-air');
        break;
      case 'throw':
        this.swing('throw');
        break;
      case 'light-hit':
        this.strike('light');
        break;
      case 'body-hit':
        this.strike('body');
        break;
      case 'heavy-hit':
      case 'heavy-impact':
      case 'counter-hit':
        this.strike('heavy');
        break;
      case 'low-kick':
      case 'low-hit':
        this.strike('low');
        break;
      case 'overhead-hit':
        this.strike('overhead');
        break;
      case 'anti-air-hit':
        this.strike('anti_air');
        break;
      case 'throw-hit':
        this.throwCue(false);
        break;
      case 'block':
      case 'blocked':
      case 'guard':
      case 'guard-hit':
        this.block();
        break;
      case 'parry':
      case 'veto':
        this.parry();
        break;
      case 'throw-break':
        this.throwCue(name === 'throw-break');
        break;
      case 'jump':
      case 'takeoff':
        this.jump();
        break;
      case 'land':
      case 'landing':
        this.land();
        break;
      case 'special':
        this.special(name);
        break;
      case 'special-veto':
      case 'special-papers':
      case 'special-summit':
        this.signatureCharge();
        break;
      case 'special-veto-hit':
      case 'special-papers-hit':
      case 'special-summit-hit':
        this.special(name);
        break;
      case 'dash':
      case 'dash-forward':
      case 'dash-back':
        this.dash(name === 'dash-back');
        break;
      case 'round-start':
      case 'round-begin':
      case 'ready':
        this.roundStart();
        break;
      case 'round-end':
      case 'victory':
      case 'defeat':
        this.roundEnd(name === 'victory');
        break;
      case 'ui':
      case 'ui-click':
      case 'click':
      case 'select':
      case 'confirm':
        this.ui();
        break;
      default:
        break;
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
    this.updateMasterGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateMasterGain();
  }

  /** Select the leader recipe used by a later play('signature') call. */
  setSignatureLeader(id: string | null): void {
    const key = id?.toLowerCase().replace(/[._\s]+/g, '-');
    this.activeSignatureId = key && SIGNATURE_RECIPES[key] ? key : null;
  }

  /** Play a leader-specific signature without changing the active selection. */
  playSignature(id: string): void {
    if (!this.unlocked || this.disposed) return;
    const key = id.toLowerCase().replace(/[._\s]+/g, '-');
    if (SIGNATURE_RECIPES[key]) this.signature(key);
  }

  /** Exact post-limiter mix used alongside canvas.captureStream() in replays. */
  getCaptureStream(): MediaStream {
    this.ensureGraph();
    if (this.captureDestination) return this.captureDestination.stream;
    return typeof MediaStream === 'undefined' ? ({} as MediaStream) : new MediaStream();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unlocked = false;
    this.activeVoices.forEach((source) => {
      try {
        source.stop();
      } catch {
        // A source may already have ended between iteration and stop().
      }
      source.disconnect();
    });
    this.activeVoices.clear();
    this.master?.disconnect();
    this.effects?.disconnect();
    this.compressor?.disconnect();
    this.captureDestination?.disconnect();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.effects = null;
    this.compressor = null;
    this.captureDestination = null;
    this.noiseBeds.clear();
    this.recordedBuffers.clear();
    this.recordedReady = false;
    this.recordedLoad = null;
    if (context) void context.close();
  }

  private ensureGraph(): void {
    if (this.context || this.disposed || typeof window === 'undefined') return;
    const candidate = (window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextWithWebkit }).webkitAudioContext) as AudioContextWithWebkit | undefined;
    if (!candidate) return;
    try {
      this.context = new candidate();
      this.master = this.context.createGain();
      this.effects = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.captureDestination = this.context.createMediaStreamDestination();

      // This is the safety ceiling for overlapping impact layers. It is last
      // before the master and capture bus, so both live and recorded audio use
      // the same bounded mix.
      this.compressor.threshold.value = -9;
      this.compressor.knee.value = 20;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.0025;
      this.compressor.release.value = 0.16;
      this.effects.connect(this.compressor);
      this.compressor.connect(this.master);
      this.master.connect(this.context.destination);
      this.master.connect(this.captureDestination);
      this.updateMasterGain();
    } catch {
      this.context = null;
      this.master = null;
      this.effects = null;
      this.compressor = null;
      this.captureDestination = null;
    }
  }

  /** Generate reusable one-second beds once after the user gesture. */
  private preloadBeds(): void {
    if (!this.context || this.noiseBeds.size > 0) return;
    const sampleRate = this.context.sampleRate;
    const length = Math.ceil(sampleRate * 1.05);
    const bed = this.context.createBuffer(1, length, sampleRate);
    const channel = bed.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) {
      // Slightly correlated noise has more body than an independent random
      // sample on every cue while remaining completely synthetic.
      const raw = this.nextRandom() * 2 - 1;
      const previous = i > 0 ? channel[i - 1] : 0;
      channel[i] = raw * 0.78 + previous * 0.22;
    }
    this.noiseBeds.set('wide', bed);
  }

  /** Decode the tiny recorded layer only after the user gesture unlocks audio. */
  private async preloadRecordedSamples(): Promise<void> {
    const context = this.context;
    if (this.recordedReady || this.recordedLoad || !context || typeof fetch !== 'function' || typeof context.decodeAudioData !== 'function') return;
    this.recordedLoad = (async () => {
      const entries = Object.values(RECORDED_SAMPLES).flat();
      await Promise.allSettled(entries.map(async (url) => {
        try {
          const response = await fetch(publicAssetUrl(url.replace(/^\//, '')));
          if (!response.ok) return;
          const data = await response.arrayBuffer();
          // A copy keeps Safari from detaching a buffer retained by a parallel
          // decode operation while Chromium is still reading it.
          const decoded = await context.decodeAudioData(data.slice(0));
          this.recordedBuffers.set(url, decoded);
        } catch {
          // Missing assets, blocked fetches, and unsupported codecs fall back
          // to the procedural foley below without interrupting unlock().
        }
      }));
      this.recordedReady = true;
    })();
    try {
      await this.recordedLoad;
    } finally {
      this.recordedLoad = null;
    }
  }

  /** Play a decoded one-shot through the same limiter/capture bus as synth. */
  private recorded(cue: RecordedCue, gain: number, pan = 0, playbackRate = 1): boolean {
    if (!this.context || !this.effects || !this.recordedReady || !this.canVoice()) return false;
    const candidates = RECORDED_SAMPLES[cue].filter((url) => this.recordedBuffers.has(url));
    if (candidates.length === 0) return false;
    const url = candidates[Math.floor(this.nextRandom() * candidates.length)];
    const buffer = this.recordedBuffers.get(url);
    if (!buffer) return false;

    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const voiceGain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.72, Math.min(1.28, playbackRate));
    const duration = Math.max(0.035, buffer.duration / source.playbackRate.value);
    const level = Math.max(0.0002, Math.min(0.2, gain));
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(level, now + Math.min(0.004, duration * 0.12));
    voiceGain.gain.setValueAtTime(level, now + Math.max(0.006, duration * 0.76));
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(voiceGain);
    this.destination(voiceGain, pan);
    if (!this.registerVoice(source)) return false;
    source.start(now);
    return true;
  }

  private updateMasterGain(): void {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.012);
  }

  private nextRandom(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  private signatureIdFrom(name: string): string | null {
    if (SIGNATURE_RECIPES[name]) return name;
    const prefix = name.match(/^(?:signature|leader)(?:-|:)(.+)$/)?.[1];
    return prefix && SIGNATURE_RECIPES[prefix] ? prefix : null;
  }

  private canVoice(): boolean {
    return this.activeVoices.size < this.maxVoices && Boolean(this.context && this.effects);
  }

  private registerVoice(source: AudioScheduledSourceNode): boolean {
    if (!this.canVoice()) {
      source.disconnect();
      return false;
    }
    this.activeVoices.add(source);
    source.addEventListener('ended', () => {
      this.activeVoices.delete(source);
      source.disconnect();
    }, { once: true });
    return true;
  }

  private destination(gain: GainNode, pan?: number): AudioNode {
    if (!this.context || !this.effects || pan === undefined) return this.effects as AudioNode;
    const panner = this.context.createStereoPanner();
    panner.pan.value = Math.min(1, Math.max(-1, pan));
    gain.connect(panner);
    panner.connect(this.effects);
    return panner;
  }

  private tone(options: ToneOptions, offset = 0): void {
    if (!this.context || !this.effects || !this.canVoice()) return;
    const now = this.context.currentTime + offset;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = options.type ?? 'sine';
    oscillator.frequency.setValueAtTime(options.frequency, now);
    if (options.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, options.endFrequency), now + options.duration);
    if (options.detune) oscillator.detune.value = options.detune;
    const attack = Math.min(options.attack ?? 0.004, options.duration * 0.35);
    const release = Math.min(options.release ?? 0.08, options.duration * 0.76);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), now + attack);
    gain.gain.setValueAtTime(Math.max(0.0002, options.gain), now + Math.max(attack, options.duration - release));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
    oscillator.connect(gain);
    if (options.pan === undefined) gain.connect(this.effects);
    else this.destination(gain, options.pan);
    if (!this.registerVoice(oscillator)) return;
    oscillator.start(now);
    oscillator.stop(now + options.duration + 0.025);
  }

  private noise(options: NoiseOptions, offset = 0): void {
    if (!this.context || !this.effects || !this.canVoice()) return;
    this.preloadBeds();
    const buffer = this.noiseBeds.get('wide');
    if (!buffer) return;
    const now = this.context.currentTime + offset;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 0.92 + this.nextRandom() * 0.16;
    filter.type = options.filter ?? 'bandpass';
    filter.frequency.setValueAtTime(Math.max(24, options.frequency), now);
    if (options.highFrequency) filter.frequency.exponentialRampToValueAtTime(Math.max(24, options.highFrequency), now + options.duration);
    filter.Q.value = options.q ?? 0.8;
    const attack = Math.min(0.006, options.duration * 0.26);
    const release = Math.min(0.1, options.duration * 0.72);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), now + attack);
    gain.gain.setValueAtTime(Math.max(0.0002, options.gain), now + Math.max(attack, options.duration - release));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
    source.connect(filter);
    filter.connect(gain);
    if (options.pan === undefined) gain.connect(this.effects);
    else this.destination(gain, options.pan);
    if (!this.registerVoice(source)) return;
    const maxOffset = Math.max(0, buffer.duration - options.duration * source.playbackRate.value - 0.01);
    source.start(now, Math.min(maxOffset, options.offset ?? this.nextRandom() * Math.min(0.18, maxOffset)));
    source.stop(now + options.duration + 0.03);
  }

  private clothSwish(duration: number, gain: number, pitch = 850, pan = 0): void {
    this.noise({ duration, gain, frequency: pitch, highFrequency: pitch * 0.32, filter: 'bandpass', q: 0.48, pan });
  }

  private impactCrack(gain: number, pitch = 2200, pan = 0): void {
    this.noise({ duration: 0.052, gain, frequency: pitch, highFrequency: pitch * 0.58, filter: 'bandpass', q: 1.25, pan });
  }

  private shoeScuff(gain = 0.1, pan = 0): void {
    this.noise({ duration: 0.12, gain, frequency: 3600, highFrequency: 1450, filter: 'highpass', q: 0.42, pan });
    this.tone({ frequency: 185, endFrequency: 72, duration: 0.1, gain: gain * 0.22, type: 'triangle', release: 0.06, pan }, 0.008);
  }

  private punchBody(frequency: number, gain: number, duration = 0.19, pan = 0): void {
    this.tone({ frequency, endFrequency: frequency * 0.58, duration, gain, type: 'sine', attack: 0.003, release: duration * 0.6, pan });
    this.noise({ duration: duration * 0.72, gain: gain * 0.55, frequency: 180, highFrequency: 78, filter: 'lowpass', q: 0.42, pan }, 0.004);
  }

  private swing(action: string): void {
    const pan = (this.nextRandom() - 0.5) * 0.2;
    const recordedWhoosh = this.recorded('whoosh', 0.105, pan, 0.88 + this.nextRandom() * 0.2);
    const proceduralScale = recordedWhoosh ? 0.42 : 1;
    switch (action.replace('_', '-')) {
      case 'light':
        this.clothSwish(0.14, 0.09 * proceduralScale, 980, pan);
        this.noise({ duration: 0.07, gain: 0.04, frequency: 3500, highFrequency: 1900, filter: 'highpass', q: 0.42, pan }, 0.025);
        break;
      case 'body':
        this.clothSwish(0.18, 0.11 * proceduralScale, 650, pan);
        this.noise({ duration: 0.08, gain: 0.045, frequency: 2100, highFrequency: 820, filter: 'bandpass', q: 0.48, pan }, 0.035);
        break;
      case 'heavy':
        this.clothSwish(0.3, 0.18 * proceduralScale, 520, pan);
        this.noise({ duration: 0.12, gain: 0.07, frequency: 1600, highFrequency: 520, filter: 'bandpass', q: 0.4, pan }, 0.07);
        break;
      case 'low':
        this.clothSwish(0.19, 0.11 * proceduralScale, 460, pan);
        this.shoeScuff(0.06, pan);
        break;
      case 'overhead':
        this.clothSwish(0.34, 0.2 * proceduralScale, 410, pan);
        this.noise({ duration: 0.11, gain: 0.06, frequency: 4400, highFrequency: 1600, filter: 'highpass', q: 0.38, pan }, 0.06);
        break;
      case 'anti-air':
        this.clothSwish(0.23, 0.14 * proceduralScale, 780, pan);
        this.noise({ duration: 0.1, gain: 0.05, frequency: 2600, highFrequency: 1000, filter: 'bandpass', q: 0.5, pan }, 0.04);
        break;
      case 'throw':
        this.clothSwish(0.24, 0.17 * proceduralScale, 450, pan);
        this.noise({ duration: 0.1, gain: 0.05, frequency: 980, highFrequency: 330, filter: 'bandpass', q: 0.45, pan }, 0.08);
        break;
      default:
        this.clothSwish(0.16, 0.08 * proceduralScale, 760, pan);
        break;
    }
  }

  private step(): void {
    const pan = (this.nextRandom() - 0.5) * 0.18;
    const recordedStep = this.recorded('step', 0.14, pan, 0.94 + this.nextRandom() * 0.12);
    if (!recordedStep) this.shoeScuff(0.11, pan);
    this.noise({ duration: 0.06, gain: 0.035, frequency: 250, highFrequency: 110, filter: 'lowpass', q: 0.42, pan }, 0.012);
  }

  private signatureCharge(): void {
    const pan = (this.nextRandom() - 0.5) * 0.12;
    const recordedCloth = this.recorded('cloth', 0.08, pan, 0.9 + this.nextRandom() * 0.18);
    this.clothSwish(0.48, 0.13, 420, pan);
    if (!recordedCloth) this.clothSwish(0.3, 0.05, 780, pan);
    this.noise({ duration: 0.42, gain: 0.08, frequency: 220, highFrequency: 72, filter: 'lowpass', q: 0.46, pan }, 0.025);
    this.tone({ frequency: 74, endFrequency: 104, duration: 0.46, gain: 0.08, type: 'sine', release: 0.22, pan });
  }

  private strike(kind: 'light' | 'body' | 'heavy' | 'low' | 'overhead' | 'anti_air'): void {
    const variation = (this.nextRandom() - 0.5) * 0.18;
    const pan = (this.nextRandom() - 0.5) * 0.26;
    const recordedKind: RecordedCue = kind === 'light' ? 'light' : kind === 'heavy' || kind === 'overhead' ? 'heavy' : kind === 'anti_air' ? 'body' : kind === 'low' ? 'body' : 'body';
    const recordedImpact = this.recorded(recordedKind, kind === 'heavy' ? 0.16 : 0.12, pan, 0.92 + this.nextRandom() * 0.15);
    const syntheticTransientScale = recordedImpact ? 0.42 : 1;
    const syntheticBodyScale = recordedImpact ? 0.72 : 1;
    switch (kind) {
      case 'light':
        this.clothSwish(0.15, 0.12, 920, pan);
        this.impactCrack(0.25 * syntheticTransientScale, 2450, pan);
        this.punchBody(116 + variation * 40, 0.22 * syntheticBodyScale, 0.13, pan);
        break;
      case 'body':
        this.clothSwish(0.19, 0.15, 620, pan);
        this.impactCrack(0.19 * syntheticTransientScale, 1760, pan);
        this.punchBody(82 + variation * 30, 0.3 * syntheticBodyScale, 0.22, pan);
        break;
      case 'heavy':
        this.clothSwish(0.31, 0.24, 520, pan);
        this.impactCrack(0.4 * syntheticTransientScale, 1950, pan);
        this.punchBody(58 + variation * 18, 0.48 * syntheticBodyScale, 0.31, pan);
        this.tone({ frequency: 118, endFrequency: 54, duration: 0.19, gain: 0.2 * syntheticBodyScale, type: 'triangle', release: 0.12, pan }, 0.012);
        break;
      case 'low':
        this.clothSwish(0.18, 0.14, 430, pan);
        this.shoeScuff(0.15, pan);
        this.impactCrack(0.22 * syntheticTransientScale, 1380, pan);
        this.punchBody(76 + variation * 20, 0.3 * syntheticBodyScale, 0.21, pan);
        break;
      case 'overhead':
        this.clothSwish(0.36, 0.25, 420, pan);
        this.impactCrack(0.32 * syntheticTransientScale, 1600, pan);
        this.punchBody(68 + variation * 20, 0.38 * syntheticBodyScale, 0.26, pan);
        this.noise({ duration: 0.08, gain: 0.08, frequency: 7200, highFrequency: 2300, filter: 'highpass', q: 0.35, pan }, 0.02);
        break;
      case 'anti_air':
        this.clothSwish(0.25, 0.19, 770, pan);
        this.impactCrack(0.3 * syntheticTransientScale, 2100, pan);
        this.punchBody(92 + variation * 30, 0.32 * syntheticBodyScale, 0.23, pan);
        break;
    }
  }

  private block(): void {
    const pan = (this.nextRandom() - 0.5) * 0.2;
    const recordedGuard = this.recorded('guard', 0.11, pan, 0.92 + this.nextRandom() * 0.14);
    this.clothSwish(0.1, 0.12, 1140, pan);
    this.noise({ duration: 0.095, gain: recordedGuard ? 0.09 : 0.22, frequency: 2850, highFrequency: 1350, filter: 'bandpass', q: 2.1, pan });
    this.tone({ frequency: 330, endFrequency: 178, duration: 0.16, gain: 0.12, type: 'triangle', release: 0.1, pan });
    this.tone({ frequency: 690, endFrequency: 410, duration: 0.11, gain: 0.085, type: 'sine', release: 0.065, pan }, 0.012);
  }

  private parry(): void {
    const pan = (this.nextRandom() - 0.5) * 0.24;
    this.impactCrack(0.25, 3300, pan);
    this.noise({ duration: 0.16, gain: 0.1, frequency: 4700, highFrequency: 2300, filter: 'bandpass', q: 1.1, pan }, 0.015);
    this.tone({ frequency: 510, endFrequency: 1210, duration: 0.24, gain: 0.13, type: 'triangle', release: 0.14, pan });
    this.tone({ frequency: 770, endFrequency: 1640, duration: 0.22, gain: 0.08, type: 'sine', release: 0.13, pan }, 0.025);
  }

  private throwCue(breakWindow: boolean): void {
    const pan = (this.nextRandom() - 0.5) * 0.2;
    const recordedCloth = this.recorded('cloth', 0.09, pan, breakWindow ? 1.1 : 0.92);
    this.clothSwish(0.23, 0.22, breakWindow ? 980 : 420, pan);
    if (!recordedCloth) this.clothSwish(0.16, 0.06, breakWindow ? 1200 : 380, pan);
    this.noise({ duration: 0.18, gain: breakWindow ? 0.18 : 0.24, frequency: breakWindow ? 1900 : 380, highFrequency: breakWindow ? 710 : 92, filter: breakWindow ? 'bandpass' : 'lowpass', q: 0.75, pan }, 0.035);
    this.punchBody(breakWindow ? 260 : 64, breakWindow ? 0.15 : 0.32, breakWindow ? 0.12 : 0.24, pan);
  }

  private jump(): void {
    this.clothSwish(0.23, 0.1, 460, 0);
    this.shoeScuff(0.08, (this.nextRandom() - 0.5) * 0.15);
    this.tone({ frequency: 120, endFrequency: 230, duration: 0.15, gain: 0.07, type: 'triangle', release: 0.09 });
  }

  private land(): void {
    const pan = (this.nextRandom() - 0.5) * 0.14;
    const recordedLand = this.recorded('land', 0.15, pan, 0.9 + this.nextRandom() * 0.12);
    if (!recordedLand) this.shoeScuff(0.17, pan);
    this.noise({ duration: 0.2, gain: recordedLand ? 0.18 : 0.27, frequency: 290, highFrequency: 105, filter: 'lowpass', q: 0.46, pan });
    this.tone({ frequency: 62, endFrequency: 38, duration: 0.22, gain: recordedLand ? 0.16 : 0.25, type: 'sine', release: 0.13, pan });
    this.clothSwish(0.12, 0.08, 720, 0.02);
  }

  private dash(backward: boolean): void {
    const pan = backward ? -0.08 : 0.08;
    this.clothSwish(0.24, 0.16, backward ? 610 : 980, pan);
    this.shoeScuff(0.12, pan);
    this.noise({ duration: 0.15, gain: 0.07, frequency: 1900, highFrequency: 800, filter: 'highpass', q: 0.45, pan });
  }

  private special(name: string): void {
    const pan = (this.nextRandom() - 0.5) * 0.18;
    const base = name.includes('papers') ? 320 : name.includes('summit') ? 240 : 430;
    this.clothSwish(0.52, 0.24, 360, pan);
    this.noise({ duration: 0.34, gain: 0.11, frequency: 4100, highFrequency: 820, filter: 'bandpass', q: 0.48, pan }, 0.05);
    this.tone({ frequency: base, endFrequency: base * 1.7, duration: 0.46, gain: 0.15, type: 'sawtooth', release: 0.2, pan });
    this.tone({ frequency: base * 1.98, endFrequency: base * 3.5, duration: 0.36, gain: 0.07, type: 'triangle', release: 0.16, pan }, 0.08);
    this.impactCrack(0.28, 1750, pan);
    this.punchBody(72, 0.28, 0.24, pan);
  }

  private signature(id: string): void {
    const recipe = SIGNATURE_RECIPES[id];
    if (!recipe) return;
    const pan = recipe.pan + (this.nextRandom() - 0.5) * 0.06;
    const root = recipe.root;
    switch (recipe.texture) {
      case 'brass':
        this.clothSwish(0.38, 0.2, root * 8, pan);
        this.impactCrack(0.34, root * 22, pan);
        this.punchBody(root, 0.38, 0.26, pan);
        this.tone({ frequency: root * 2.98, endFrequency: root * 2.2, duration: 0.35, gain: 0.12, type: 'sawtooth', release: 0.18, pan }, 0.04);
        break;
      case 'stone':
        this.noise({ duration: 0.42, gain: 0.34, frequency: 220, highFrequency: 62, filter: 'lowpass', q: 0.38, pan });
        this.tone({ frequency: root, endFrequency: root * 0.48, duration: 0.38, gain: 0.46, type: 'sine', release: 0.2, pan });
        this.tone({ frequency: root * 1.51, endFrequency: root * 1.18, duration: 0.22, gain: 0.09, type: 'triangle', release: 0.12, pan }, 0.03);
        break;
      case 'ice':
      case 'crystal':
        this.impactCrack(0.26, root * 21, pan);
        this.noise({ duration: 0.38, gain: 0.11, frequency: root * 18, highFrequency: root * 7, filter: 'bandpass', q: 1.6, pan }, 0.02);
        this.tone({ frequency: root * 2.01, endFrequency: root * 4.1, duration: 0.42, gain: 0.13, type: 'sine', release: 0.24, pan });
        this.tone({ frequency: root * 3.01, endFrequency: root * 5.7, duration: 0.28, gain: 0.075, type: 'triangle', release: 0.15, pan }, 0.06);
        break;
      case 'pulse':
        this.punchBody(root, 0.27, 0.14, pan);
        this.punchBody(root * 1.19, 0.23, 0.14, pan);
        this.punchBody(root * 1.5, 0.3, 0.2, pan);
        this.noise({ duration: 0.18, gain: 0.12, frequency: root * 10, highFrequency: root * 4, filter: 'bandpass', q: 1.2, pan }, 0.18);
        break;
      case 'stomp':
        this.shoeScuff(0.24, pan);
        this.noise({ duration: 0.38, gain: 0.34, frequency: 340, highFrequency: 82, filter: 'lowpass', q: 0.42, pan });
        this.tone({ frequency: root, endFrequency: root * 0.52, duration: 0.3, gain: 0.38, type: 'triangle', release: 0.18, pan }, 0.025);
        this.clothSwish(0.28, 0.16, 580, pan);
        break;
      case 'glass':
        this.impactCrack(0.28, 4300, pan);
        this.tone({ frequency: root * 2, endFrequency: root * 3.8, duration: 0.3, gain: 0.12, type: 'sine', release: 0.16, pan });
        this.tone({ frequency: root * 3.01, endFrequency: root * 5.2, duration: 0.42, gain: 0.1, type: 'triangle', release: 0.22, pan }, 0.045);
        this.noise({ duration: 0.2, gain: 0.09, frequency: 6200, highFrequency: 2200, filter: 'bandpass', q: 2.3, pan }, 0.02);
        break;
      case 'velvet':
        this.clothSwish(0.56, 0.26, 490, pan);
        this.noise({ duration: 0.28, gain: 0.16, frequency: 190, highFrequency: 68, filter: 'lowpass', q: 0.52, pan });
        this.tone({ frequency: root, endFrequency: root * 0.8, duration: 0.46, gain: 0.27, type: 'sine', release: 0.24, pan });
        this.tone({ frequency: root * 1.25, endFrequency: root * 1.05, duration: 0.3, gain: 0.1, type: 'triangle', release: 0.17, pan }, 0.06);
        break;
      case 'sand':
        this.noise({ duration: 0.58, gain: 0.24, frequency: 1150, highFrequency: 280, filter: 'bandpass', q: 0.38, pan });
        this.noise({ duration: 0.2, gain: 0.12, frequency: 5400, highFrequency: 1800, filter: 'highpass', q: 0.4, pan }, 0.09);
        this.punchBody(root, 0.24, 0.3, pan);
        break;
      case 'wood':
        this.impactCrack(0.28, 1260, pan);
        this.noise({ duration: 0.21, gain: 0.2, frequency: 320, highFrequency: 120, filter: 'lowpass', q: 0.55, pan });
        this.tone({ frequency: root, endFrequency: root * 0.54, duration: 0.27, gain: 0.28, type: 'triangle', release: 0.16, pan });
        this.tone({ frequency: root * 2.2, duration: 0.13, gain: 0.08, type: 'sine', release: 0.08, pan }, 0.025);
        break;
      case 'ledger':
        this.noise({ duration: 0.045, gain: 0.14, frequency: 4400, highFrequency: 1800, filter: 'bandpass', q: 1.6, pan });
        this.noise({ duration: 0.28, gain: 0.1, frequency: 780, highFrequency: 240, filter: 'bandpass', q: 0.65, pan }, 0.05);
        this.tone({ frequency: root, endFrequency: root * 1.33, duration: 0.32, gain: 0.17, type: 'triangle', release: 0.18, pan });
        this.tone({ frequency: root * 1.5, endFrequency: root * 1.08, duration: 0.22, gain: 0.08, type: 'sine', release: 0.13, pan }, 0.08);
        break;
      case 'equation':
        this.punchBody(root, 0.19, 0.12, pan);
        this.punchBody(root * 1.25, 0.19, 0.12, pan);
        this.punchBody(root * 1.56, 0.25, 0.15, pan);
        this.noise({ duration: 0.3, gain: 0.1, frequency: 2500, highFrequency: 620, filter: 'bandpass', q: 0.7, pan }, 0.15);
        break;
      case 'ink':
        this.clothSwish(0.41, 0.18, 1040, pan);
        this.noise({ duration: 0.16, gain: 0.13, frequency: 1800, highFrequency: 520, filter: 'bandpass', q: 0.55, pan }, 0.06);
        this.tone({ frequency: root, endFrequency: root * 0.72, duration: 0.29, gain: 0.29, type: 'sine', release: 0.17, pan });
        break;
      case 'guard':
        this.noise({ duration: 0.3, gain: 0.24, frequency: 2500, highFrequency: 720, filter: 'bandpass', q: 1.5, pan });
        this.tone({ frequency: root * 2, endFrequency: root * 1.1, duration: 0.32, gain: 0.2, type: 'triangle', release: 0.18, pan });
        this.tone({ frequency: root * 3, endFrequency: root * 1.8, duration: 0.19, gain: 0.1, type: 'sine', release: 0.1, pan }, 0.02);
        this.punchBody(root * 0.5, 0.22, 0.27, pan);
        break;
      case 'gold':
        this.impactCrack(0.24, root * 18, pan);
        this.tone({ frequency: root * 2, duration: 0.45, gain: 0.13, type: 'sine', release: 0.28, pan });
        this.tone({ frequency: root * 3.01, duration: 0.36, gain: 0.1, type: 'triangle', release: 0.21, pan }, 0.055);
        this.punchBody(root, 0.27, 0.24, pan);
        break;
      case 'harbor':
        this.clothSwish(0.44, 0.18, 550, pan);
        this.noise({ duration: 0.33, gain: 0.14, frequency: 820, highFrequency: 230, filter: 'lowpass', q: 0.55, pan });
        this.tone({ frequency: root, endFrequency: root * 0.74, duration: 0.42, gain: 0.28, type: 'triangle', release: 0.23, pan });
        break;
      case 'wild':
        this.clothSwish(0.25, 0.3, 1320, pan);
        this.noise({ duration: 0.18, gain: 0.22, frequency: 5100, highFrequency: 980, filter: 'bandpass', q: 0.6, pan }, 0.03);
        this.tone({ frequency: root, endFrequency: root * 0.36, duration: 0.36, gain: 0.33, type: 'sawtooth', release: 0.19, pan });
        this.impactCrack(0.32, 2400, pan);
        break;
      case 'command':
        this.noise({ duration: 0.3, gain: 0.16, frequency: 3100, highFrequency: 780, filter: 'bandpass', q: 1.4, pan });
        this.punchBody(root, 0.4, 0.31, pan);
        this.tone({ frequency: root * 2, endFrequency: root * 1.1, duration: 0.25, gain: 0.12, type: 'square', release: 0.14, pan }, 0.02);
        break;
    }
  }

  private roundStart(): void {
    this.tone({ frequency: 196, duration: 0.22, gain: 0.1, type: 'triangle', release: 0.12 });
    this.tone({ frequency: 293.7, duration: 0.24, gain: 0.12, type: 'triangle', release: 0.14 }, 0.14);
    this.tone({ frequency: 392, duration: 0.34, gain: 0.16, type: 'triangle', release: 0.2 }, 0.29);
    this.clothSwish(0.34, 0.05, 680, 0);
  }

  private roundEnd(victory: boolean): void {
    const notes = victory ? [392, 493.88, 587.33] : [293.7, 246.94, 196];
    notes.forEach((frequency, index) => this.tone({ frequency, duration: 0.3, gain: 0.1, type: 'triangle', release: 0.18 }, index * 0.15));
    this.clothSwish(0.35, 0.06, victory ? 760 : 360, 0);
  }

  private ui(): void {
    this.noise({ duration: 0.035, gain: 0.06, frequency: 3400, highFrequency: 1900, filter: 'bandpass', q: 1.1 });
    this.tone({ frequency: 620, endFrequency: 430, duration: 0.055, gain: 0.045, type: 'triangle', release: 0.03 });
  }
}

export default GameAudio;
