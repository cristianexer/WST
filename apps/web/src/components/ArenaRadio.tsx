import { FolderUp, Pause, Play, Radio, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ARENA_STATIONS,
  ArenaRadioEngine,
  type ArenaRadioSnapshot,
  type BuiltInArenaStationId,
} from '../audio/radio';
import './arena-radio.css';

export interface ArenaRadioProps {
  /** Shared application mute setting; it always wins over the local master gain. */
  muted: boolean;
  /** Shared effects/master volume, expressed from 0 to 1. */
  volume: number;
  /** Allows the parent settings store to make the tuner volume persistent. */
  onVolumeChange?: (volume: number) => void;
}

const initialSnapshot = (): ArenaRadioSnapshot => ({
  station: ARENA_STATIONS[0], playing: false, pending: false, unavailable: false, localTrackName: null,
});

/** Persistent header tuner for bundled recorded rock and user-owned local tracks. */
export function ArenaRadio({ muted, volume, onVolumeChange }: ArenaRadioProps) {
  const [snapshot, setSnapshot] = useState<ArenaRadioSnapshot>(initialSnapshot);
  const radio = useRef<ArenaRadioEngine | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const engine = new ArenaRadioEngine({ muted, volume, onChange: setSnapshot });
    radio.current = engine;
    setSnapshot(engine.snapshot);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') engine.suspendForVisibility();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      engine.dispose();
      if (radio.current === engine) radio.current = null;
    };
  }, []);

  useEffect(() => { radio.current?.setMuted(muted); }, [muted]);
  useEffect(() => { radio.current?.setVolume(volume); }, [volume]);

  const select = (id: BuiltInArenaStationId) => radio.current?.setStation(id);
  const toggle = () => {
    const engine = radio.current;
    if (!engine) return;
    if (engine.snapshot.playing || engine.snapshot.pending) engine.pause();
    else void engine.play(); // Invoked only by this explicit user gesture.
  };
  const chooseLocalTrack = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) radio.current?.selectLocalFile(file);
    // Let the player select the same owned file again after changing stations.
    event.currentTarget.value = '';
  };
  const builtInValue = snapshot.station.id === 'local' ? '' : snapshot.station.id;

  return (
    <section className="arena-radio" aria-label="Arena radio">
      <div className="arena-radio-ident">
        <Radio size={15} aria-hidden="true" />
        <div>
          <span>ARENA RADIO</span>
          <strong>{snapshot.station.frequency}</strong>
        </div>
      </div>
      <div className="arena-radio-now-playing">
        <span className={snapshot.playing ? 'on-air' : ''}>{snapshot.playing ? 'ON AIR' : snapshot.pending ? 'STARTING' : 'PAUSED'}</span>
        <strong>{snapshot.station.name}</strong>
        <small>{snapshot.station.id === 'local' ? snapshot.localTrackName ?? 'USER-OWNED AUDIO' : `${snapshot.station.artist} · ${snapshot.station.license}`}</small>
      </div>
      <div className="arena-radio-controls">
        <button type="button" aria-label="Previous arena radio station" title="Previous station" onClick={() => radio.current?.previous()}><SkipBack size={14} /></button>
        <button type="button" className="arena-radio-play" aria-label={snapshot.playing || snapshot.pending ? 'Pause arena radio' : 'Play arena radio'} onClick={toggle}>
          {snapshot.playing || snapshot.pending ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <button type="button" aria-label="Next arena radio station" title="Next station" onClick={() => radio.current?.next()}><SkipForward size={14} /></button>
      </div>
      <label className="arena-radio-volume">
        <Volume2 size={14} aria-hidden="true" />
        <input
          aria-label="Arena radio volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(event) => onVolumeChange?.(Number(event.target.value))}
          disabled={!onVolumeChange}
        />
      </label>
      <label className="arena-radio-select">
        <span className="sr-only">Arena radio station</span>
        <select value={builtInValue} onChange={(event) => select(event.target.value as BuiltInArenaStationId)} aria-label="Arena radio station">
          {snapshot.station.id === 'local' && <option value="" disabled>YOUR FILE</option>}
          {ARENA_STATIONS.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
        </select>
      </label>
      <input ref={fileInput} className="arena-radio-file" type="file" accept="audio/*,.mp3,.m4a,.ogg,.wav,.flac" onChange={chooseLocalTrack} aria-label="Choose music from this device" />
      <button type="button" className="arena-radio-upload" onClick={() => fileInput.current?.click()} title="Play a music file you own"><FolderUp size={14} /><span>YOUR TRACK</span></button>
      {snapshot.unavailable && <span className="arena-radio-error" role="status">Audio unavailable</span>}
    </section>
  );
}
