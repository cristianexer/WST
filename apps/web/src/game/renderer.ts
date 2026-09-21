import { publicAssetUrl } from '../assets';
import * as THREE from 'three';
import type { MatchState } from '../../../../packages/combat-core/src/index';

import { FighterSprite } from './fighter-sprites';
import { ArenaEffects } from './effects';

export interface ArenaRendererOptions {
  playerColor: string;
  opponentColor: string;
  playerStyle?: string;
  opponentStyle?: string;
  quality?: 'high' | 'low';
  reducedMotion?: boolean;
}

export class ArenaRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly ready: Promise<void>;
  private readonly container: HTMLElement;
  private readonly backdrop: THREE.Texture;
  private readonly effects: ArenaEffects;
  private readonly fighters: [FighterSprite, FighterSprite];
  private readonly quality: 'high' | 'low';
  private readonly reducedMotion: boolean;
  private elapsedSeconds = 0;
  private cameraTargetX = 0;
  private cameraDistance = 10;
  private contextError: Error | null = null;
  private disposed = false;
  private visualPositions: { x: number; y: number }[] = [];
  private visualRound = -1;
  private visualTick = -1;

  constructor(container: HTMLElement, options: ArenaRendererOptions) {
    this.container = container;
    this.quality = options.quality ?? 'high';
    this.reducedMotion = options.reducedMotion ?? false;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', 'Summit fighting arena with realistic animated character artwork');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    const context = this.canvas.getContext('webgl2', { alpha: false, antialias: this.quality === 'high', powerPreference: 'high-performance' });
    if (!context) {
      throw new Error('WebGL 2 is unavailable. Summit Showdown needs a current browser with hardware graphics enabled.');
    }
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context, antialias: this.quality === 'high', powerPreference: 'high-performance' });
    } catch (error) {
      throw new Error('The Summit Showdown graphics context could not be created.', { cause: error });
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.7 : 1.2));
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored, false);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070b11');
    this.scene.fog = null;
    this.camera = new THREE.PerspectiveCamera(37, 16 / 9, 0.1, 60);
    this.camera.position.set(0, 2.5, 10);
    this.camera.lookAt(0, 1.2, 0);

    let resolveBackdrop!: () => void;
    let rejectBackdrop!: (error: Error) => void;
    const backdropReady = new Promise<void>((resolve, reject) => { resolveBackdrop = resolve; rejectBackdrop = reject; });
    this.backdrop = new THREE.TextureLoader().load(publicAssetUrl('assets/summit-arena.png'), texture => {
      if(this.disposed){texture.dispose();resolveBackdrop();return;}
      texture.colorSpace = THREE.SRGBColorSpace; this.fitBackdrop(); resolveBackdrop();
    }, undefined, () => rejectBackdrop(new Error('The summit arena artwork could not load. Return to selection and retry.')));
    this.backdrop.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.backdrop;
    this.effects = new ArenaEffects(this.reducedMotion);
    this.scene.add(this.effects.group);
    this.fighters = [
      new FighterSprite(options.playerStyle ?? 'trump', options.playerColor || '#42d8e8'),
      new FighterSprite(options.opponentStyle ?? 'xi', options.opponentColor || '#ef8247'),
    ];
    this.scene.add(this.fighters[0].group, this.fighters[1].group);
    this.ready = Promise.all([backdropReady, ...this.fighters.map(fighter => fighter.ready)]).then(async () => {
      if (this.disposed) return;
      this.renderer.initTexture(this.backdrop);
      this.fighters.forEach(fighter => fighter.prepare(this.renderer));
      await this.renderer.compileAsync(this.scene, this.camera);
    });
    this.resize();
  }

  render(state: MatchState, deltaSeconds: number): void {
    if (this.disposed) return;
    if (this.contextError) throw this.contextError;
    const delta = Math.min(0.1, Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
    this.elapsedSeconds += delta;
    const fighters = state.fighters;
    const left = fighters?.[0];
    const right = fighters?.[1];
    if (left && right) {
      if (state.round !== this.visualRound || state.tick < this.visualTick || !this.visualPositions.length) {
        this.visualPositions = fighters.map(fighter => ({ x: fighter.x, y: fighter.y }));
        this.fighters.forEach(fighter => fighter.resetMotion());
        this.effects.reset();
      }
      this.visualRound = state.round;
      this.visualTick = state.tick;
      // The worker remains authoritative at 60 Hz; this short visual smoothing
      // keeps higher-refresh displays fluid without changing collision positions.
      const smoothing = 1 - Math.exp(-110 * delta);
      this.visualPositions.forEach((position, index) => {
        position.x = THREE.MathUtils.lerp(position.x, fighters[index].x, smoothing);
        position.y = THREE.MathUtils.lerp(position.y, fighters[index].y, smoothing);
      });
      const leftX = this.visualPositions[0].x;
      const rightX = this.visualPositions[1].x;
      const centre = (leftX + rightX) * 0.5;
      const halfWidth = Math.abs(leftX - rightX) * 0.5 + 1.65;
      const field = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const distance = Math.max(6.9, halfWidth / (field * this.camera.aspect));
      this.cameraDistance = THREE.MathUtils.lerp(this.cameraDistance, distance, Math.min(1, delta * (distance > this.cameraDistance ? 15 : 2)));
      this.cameraTargetX = THREE.MathUtils.lerp(this.cameraTargetX, centre, 1 - Math.pow(0.0001, delta));
      this.fighters[0].group.position.x = leftX;
      this.fighters[1].group.position.x = rightX;
      this.fighters[0].update(left, delta, this.visualPositions[0].y);
      this.fighters[1].update(right, delta, this.visualPositions[1].y);
    }

    this.effects.update(delta);
    const lookX = this.cameraTargetX;
    this.camera.position.set(lookX, 2.25, this.cameraDistance);
    this.camera.lookAt(lookX, 1.1, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /** Process every simulation tick, even when the graphics frame rate is lower. */
  consumeFrame(state: MatchState): void {
    this.effects.sync(state.events, state.fighters.map(fighter => fighter.x));
  }

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || 960);
    const height = Math.max(1, this.container.clientHeight || Math.round(width * 9 / 16));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.fitBackdrop();
  }

  private fitBackdrop(): void {
    if (!this.backdrop?.image) return;
    const imageAspect = this.backdrop.image.width / this.backdrop.image.height;
    const viewportAspect = this.camera.aspect;
    if (viewportAspect < imageAspect) {
      this.backdrop.repeat.set(viewportAspect / imageAspect, 1);
      this.backdrop.offset.set((1 - viewportAspect / imageAspect) / 2, 0);
    } else {
      this.backdrop.repeat.set(1, imageAspect / viewportAspect);
      this.backdrop.offset.set(0, (1 - imageAspect / viewportAspect) / 2);
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost, false);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored, false);
    this.fighters.forEach((fighter) => fighter.dispose());
    this.effects.dispose();
    this.backdrop.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextError = new Error('The WebGL graphics context was lost. Reload the match to restore the arena.');
  };

  private readonly onContextRestored = (): void => {
    this.contextError = null;
  };
}

export default ArenaRenderer;
