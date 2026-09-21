import { publicAssetUrl } from '../assets';

export type BuiltInArenaStationId = 'big-rock' | 'cool-rock' | 'hotrock';
export type ArenaStationId = BuiltInArenaStationId | 'local';

export interface ArenaStation {
  id: ArenaStationId;
  name: string;
  frequency: string;
  style: string;
  artist: string;
  license: string;
  sourceUrl?: string;
}

export interface BuiltInArenaStation extends ArenaStation {
  id: BuiltInArenaStationId;
}

export interface ArenaRadioSnapshot {
  station: ArenaStation;
  playing: boolean;
  pending: boolean;
  unavailable: boolean;
  localTrackName: string | null;
}

const STATION_STORAGE_KEY = 'wst.radio.station.v1';
const RADIO_GAIN = 0.42;

export const ARENA_STATIONS: readonly BuiltInArenaStation[] = [
  {
    id: 'big-rock', name: 'BIG ROCK', frequency: '108.0 FM', style: 'POWER-CHORD ARENA ROCK',
    artist: 'Kevin MacLeod', license: 'CC BY 4.0',
    sourceUrl: 'https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100305',
  },
  {
    id: 'cool-rock', name: 'COOL ROCK', frequency: '128.0 FM', style: 'DRIVING GUITAR ROCK',
    artist: 'Kevin MacLeod', license: 'CC BY 4.0',
    sourceUrl: 'https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100279',
  },
  {
    id: 'hotrock', name: 'HOTROCK', frequency: '124.0 FM', style: 'HIGH-ENERGY ROCK',
    artist: 'Kevin MacLeod', license: 'CC BY 4.0',
    sourceUrl: 'https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100201',
  },
] as const;

const LOCAL_STATION: ArenaStation = {
  id: 'local', name: 'YOUR TRACK', frequency: 'LOCAL FILE', style: 'USER-OWNED AUDIO',
  artist: 'Local device', license: 'User supplied',
};

const trackUrl: Record<BuiltInArenaStationId, string> = {
  'big-rock': 'audio/music/big-rock.mp3',
  'cool-rock': 'audio/music/cool-rock.mp3',
  hotrock: 'audio/music/hotrock.mp3',
};

export function arenaStation(id: BuiltInArenaStationId): BuiltInArenaStation {
  const station = ARENA_STATIONS.find((candidate) => candidate.id === id);
  if (!station) throw new Error(`Unknown arena station: ${id}`);
  return station;
}

export function adjacentArenaStation(current: BuiltInArenaStationId, direction: -1 | 1): BuiltInArenaStation {
  const index = ARENA_STATIONS.findIndex((station) => station.id === current);
  return ARENA_STATIONS[(index + direction + ARENA_STATIONS.length) % ARENA_STATIONS.length];
}

export interface ArenaRadioOptions {
  volume?: number;
  muted?: boolean;
  station?: BuiltInArenaStationId;
  onChange?: (snapshot: ArenaRadioSnapshot) => void;
}

/**
 * Browser-native recorded playback. It creates no audio resource until a Play
 * click. Bundled tracks are static files; a local upload becomes a temporary
 * Object URL that is revoked on replacement or disposal.
 */
export class ArenaRadioEngine {
  private audio: HTMLAudioElement | null = null;
  private selected: ArenaStationId;
  private localUrl: string | null = null;
  private localTrackName: string | null = null;
  private playing = false;
  private playRequested = false;
  private generation = 0;
  private unavailable = false;
  private volume: number;
  private muted: boolean;

  constructor(private readonly options: ArenaRadioOptions = {}) {
    this.selected = options.station ?? readSavedStation();
    this.volume = clamp(options.volume ?? 0.55);
    this.muted = options.muted ?? false;
  }

  get snapshot(): ArenaRadioSnapshot {
    return {
      station: this.selected === 'local' ? LOCAL_STATION : arenaStation(this.selected),
      playing: this.playing,
      pending: this.playRequested && !this.playing,
      unavailable: this.unavailable,
      localTrackName: this.localTrackName,
    };
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
    this.notify();
  }

  setVolume(volume: number): void {
    this.volume = clamp(volume);
    this.applyVolume();
    this.notify();
  }

  setStation(id: BuiltInArenaStationId): void {
    if (id === this.selected) return;
    const resume = this.playRequested || this.playing;
    const leavingLocalTrack = this.selected === 'local';
    this.selected = id;
    if (leavingLocalTrack) this.revokeLocalUrl();
    writeSavedStation(id);
    this.replaceSource();
    this.notify();
    if (resume) void this.play();
  }

  previous(): void {
    const current: BuiltInArenaStationId = this.selected === 'local' ? readSavedStation() : this.selected as BuiltInArenaStationId;
    this.setStation(adjacentArenaStation(current, -1).id);
  }

  next(): void {
    const current: BuiltInArenaStationId = this.selected === 'local' ? readSavedStation() : this.selected as BuiltInArenaStationId;
    this.setStation(adjacentArenaStation(current, 1).id);
  }

  /** The selected file stays on the user's device and is never uploaded. */
  selectLocalFile(file: File): void {
    if (!isAudioFile(file)) {
      this.unavailable = true;
      this.notify();
      return;
    }
    const resume = this.playRequested || this.playing;
    this.revokeLocalUrl();
    this.localUrl = URL.createObjectURL(file);
    this.localTrackName = file.name;
    this.selected = 'local';
    this.unavailable = false;
    this.replaceSource();
    this.notify();
    if (resume) void this.play();
  }

  async play(): Promise<void> {
    if (this.playRequested || this.playing) return;
    const audio = this.ensureAudio();
    if (!audio || !this.currentSource()) return;
    this.playRequested = true;
    const generation = ++this.generation;
    this.notify();
    this.setSource(audio);
    try {
      await audio.play();
      if (generation !== this.generation || !this.playRequested || this.audio !== audio) {
        // A newer station request shares this element. Pausing here would stop
        // that live request when a superseded `play()` settles late.
        if (!this.playRequested || this.audio !== audio) audio.pause();
        return;
      }
      this.playing = true;
      this.unavailable = false;
    } catch {
      if (generation === this.generation) {
        this.playing = false;
        this.playRequested = false;
        this.unavailable = true;
      }
    } finally {
      this.notify();
    }
  }

  pause(): void {
    this.generation += 1;
    this.playRequested = false;
    this.playing = false;
    this.audio?.pause();
    this.notify();
  }

  /** Hidden pages stop playback and wait for the next explicit Play click. */
  suspendForVisibility(): void {
    if (this.playing || this.playRequested) this.pause();
  }

  dispose(): void {
    this.pause();
    if (this.audio) {
      this.audio.onplay = null;
      this.audio.onpause = null;
      this.audio.onerror = null;
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
    this.revokeLocalUrl();
  }

  private ensureAudio(): HTMLAudioElement | null {
    if (this.audio) return this.audio;
    if (typeof Audio === 'undefined') {
      this.unavailable = true;
      this.notify();
      return null;
    }
    try {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.loop = true;
      audio.onplay = () => {
        if (this.playRequested) {
          this.playing = true;
          this.notify();
        }
      };
      audio.onpause = () => {
        if (!this.playRequested) {
          this.playing = false;
          this.notify();
        }
      };
      audio.onerror = () => {
        this.playing = false;
        this.playRequested = false;
        this.unavailable = true;
        this.notify();
      };
      this.audio = audio;
      this.applyVolume();
      return audio;
    } catch {
      this.unavailable = true;
      this.notify();
      return null;
    }
  }

  private replaceSource(): void {
    const audio = this.audio;
    if (!audio) return;
    this.generation += 1;
    this.playRequested = false;
    this.playing = false;
    audio.pause();
    this.setSource(audio);
  }

  private setSource(audio: HTMLAudioElement): void {
    const source = this.currentSource();
    if (!source || audio.src === source) return;
    audio.pause();
    audio.src = source;
    audio.currentTime = 0;
    audio.load();
  }

  private currentSource(): string | null {
    if (this.selected === 'local') return this.localUrl;
    return publicAssetUrl(trackUrl[this.selected]);
  }

  private applyVolume(): void {
    if (this.audio) this.audio.volume = this.muted ? 0 : clamp(this.volume * RADIO_GAIN);
  }

  private revokeLocalUrl(): void {
    if (!this.localUrl) return;
    URL.revokeObjectURL(this.localUrl);
    this.localUrl = null;
    this.localTrackName = null;
  }

  private notify(): void {
    this.options.onChange?.(this.snapshot);
  }
}

function readSavedStation(): BuiltInArenaStationId {
  try {
    const value = globalThis.localStorage?.getItem(STATION_STORAGE_KEY);
    return ARENA_STATIONS.some((station) => station.id === value) ? value as BuiltInArenaStationId : 'big-rock';
  } catch {
    return 'big-rock';
  }
}

function writeSavedStation(station: BuiltInArenaStationId): void {
  try { globalThis.localStorage?.setItem(STATION_STORAGE_KEY, station); } catch { /* private storage unavailable */ }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|ogg|wav|flac|aac)$/i.test(file.name);
}
