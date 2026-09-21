import { describe, expect, it, vi } from 'vitest';
import {
  ARENA_STATIONS,
  ArenaRadioEngine,
  adjacentArenaStation,
} from '../apps/web/src/audio/radio';

describe('ArenaRadio recorded music catalog', () => {
  it('ships three credited, licensed, recorded guitar-rock stations', () => {
    expect(ARENA_STATIONS).toHaveLength(3);
    expect(ARENA_STATIONS.map((station) => station.name)).toEqual(['BIG ROCK', 'COOL ROCK', 'HOTROCK']);
    expect(ARENA_STATIONS.every((station) => station.artist === 'Kevin MacLeod')).toBe(true);
    expect(ARENA_STATIONS.every((station) => station.license === 'CC BY 4.0')).toBe(true);
    expect(ARENA_STATIONS.every((station) => station.sourceUrl?.startsWith('https://incompetech.com/'))).toBe(true);
  });

  it('cycles only through bundled stations', () => {
    expect(adjacentArenaStation('big-rock', -1).id).toBe('hotrock');
    expect(adjacentArenaStation('hotrock', 1).id).toBe('big-rock');
  });

  it('does not allocate playback before Play, honors mute, and replaces user-owned object URLs', async () => {
    const players: FakeAudio[] = [];
    class FakeAudio {
      src = '';
      preload = '';
      loop = false;
      volume = 1;
      currentTime = 0;
      onplay: (() => void) | null = null;
      onpause: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { players.push(this); }
      async play() { this.onplay?.(); }
      pause() { this.onpause?.(); }
      load() { return undefined; }
      removeAttribute(name: string) { if (name === 'src') this.src = ''; }
    }
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:wst-owned-track');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('document', { baseURI: 'https://example.test/WST/' });
    try {
      const radio = new ArenaRadioEngine({ volume: 0.5 });
      radio.setStation('cool-rock');
      expect(players).toHaveLength(0);

      await radio.play();
      expect(players).toHaveLength(1);
      expect(players[0]).toMatchObject({ loop: true, volume: 0.21 });
      expect(players[0].src).toContain('audio/music/cool-rock.mp3');
      expect(radio.snapshot.playing).toBe(true);

      radio.setMuted(true);
      expect(players[0].volume).toBe(0);

      const file = new File(['recording'], 'my-training-song.mp3', { type: 'audio/mpeg' });
      radio.selectLocalFile(file);
      await Promise.resolve();
      expect(createUrl).toHaveBeenCalledWith(file);
      expect(radio.snapshot).toMatchObject({ station: { id: 'local' }, localTrackName: 'my-training-song.mp3' });
      expect(players[0].src).toBe('blob:wst-owned-track');

      radio.setStation('big-rock');
      expect(revokeUrl).toHaveBeenCalledWith('blob:wst-owned-track');
      radio.pause();
      expect(radio.snapshot.playing).toBe(false);
      radio.dispose();
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('keeps the newest station alive when old play requests settle late, and pause wins pending playback', async () => {
    const players: DeferredAudio[] = [];
    const resolvePlays: Array<() => void> = [];
    class DeferredAudio {
      src = '';
      preload = '';
      loop = false;
      volume = 1;
      currentTime = 0;
      onplay: (() => void) | null = null;
      onpause: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pauses = 0;
      constructor() { players.push(this); }
      play() {
        return new Promise<void>((resolve) => {
          resolvePlays.push(() => { this.onplay?.(); resolve(); });
        });
      }
      pause() { this.pauses += 1; this.onpause?.(); }
      load() { return undefined; }
      removeAttribute(name: string) { if (name === 'src') this.src = ''; }
    }
    vi.stubGlobal('Audio', DeferredAudio);
    vi.stubGlobal('document', { baseURI: 'https://example.test/WST/' });
    try {
      const radio = new ArenaRadioEngine();
      const stalePlay = radio.play();
      expect(radio.snapshot.pending).toBe(true);
      radio.setStation('hotrock');
      expect(players[0].src).toContain('audio/music/hotrock.mp3');
      expect(resolvePlays).toHaveLength(2);

      resolvePlays.shift()?.();
      await stalePlay;
      // The old promise must not pause the current station's newer request.
      expect(radio.snapshot.station.id).toBe('hotrock');
      expect(radio.snapshot.pending || radio.snapshot.playing).toBe(true);

      resolvePlays.shift()?.();
      await Promise.resolve();
      expect(radio.snapshot).toMatchObject({ playing: true, pending: false });

      radio.pause();
      expect(radio.snapshot).toMatchObject({ playing: false, pending: false });
      const pendingPause = radio.play();
      expect(radio.snapshot.pending).toBe(true);
      radio.pause();
      resolvePlays.shift()?.();
      await pendingPause;
      expect(radio.snapshot).toMatchObject({ playing: false, pending: false });
      radio.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
