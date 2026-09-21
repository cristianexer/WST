import { publicAssetUrl } from '../assets';
import * as THREE from 'three';
import type { FighterState } from '../../../../packages/combat-core/src';
import { selectFighterPose, type PoseBank } from './fighter-animation';
import atlasFrames from './fighter-atlas-frames.json';
import { FighterKinetics } from './fighter-kinetics';

interface AtlasBank {
  file: string;
  width: number;
  height: number;
  frames: { x: number; y: number; width: number; height: number; strips?: number[][] }[];
}

/** Three eight-pose atlases, loaded only for the two selected delegates. */
export class FighterSprite {
  readonly group = new THREE.Group();
  readonly ready: Promise<void>;
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly textures = new Map<PoseBank, THREE.Texture>();
  private readonly atlases: Record<PoseBank, AtlasBank>;
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private layout = { width: 1.665, height: 2.22, x: 0, y: 0 };
  private poseKey = '';
  private loaded = false;
  private disposed = false;
  private elapsed = 0;
  private kinetics = new FighterKinetics();
  private loadFailure: Error | null = null;
  private readonly shadow: THREE.Mesh;

  constructor(style: string, accent: string) {
    const atlases = (atlasFrames as Record<string, Record<PoseBank, AtlasBank>>)[style];
    if (!atlases) throw new Error(`The ${style} animation atlas is unavailable.`);
    this.atlases = atlases;
    this.group.name = `generated-fighter-${style}`;
    const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: .12, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.geometries.set('rectangle', this.mesh.geometry);
    this.mesh.position.y = 2.22 * .42;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
    this.group.add(this.mesh);
    const loader = new THREE.TextureLoader();
    this.ready = Promise.all((['base', 'motion', 'combat'] as const).map(bank => new Promise<void>((resolve, reject) => {
      const texture = loader.load(publicAssetUrl(`assets/fighters/${this.atlases[bank].file}`), loaded => {
        if (this.disposed) { loaded.dispose(); resolve(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.minFilter = THREE.LinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.generateMipmaps = false;
        resolve();
      }, undefined, () => {
        this.loadFailure = new Error(`The ${style} ${bank} artwork could not load. Return to selection and retry.`);
        reject(this.loadFailure);
      });
      this.textures.set(bank, texture);
    }))).then(() => {
      if (this.disposed) return;
      this.loaded = true;
      this.mesh.visible = true;
      this.setPose('base', 0);
    });
    const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: .48, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.35, 40), shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.y = .5;
    this.shadow.position.y = .012;
    this.group.add(this.shadow);
    const marker = new THREE.Mesh(new THREE.RingGeometry(.32, .34, 40), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: .38, side: THREE.DoubleSide, depthWrite: false }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = .014;
    marker.scale.y = .55;
    this.group.add(marker);
  }

  private setPose(bank: PoseBank, frame: number) {
    const key = `${bank}:${frame}`;
    if (key === this.poseKey) return;
    this.poseKey = key;
    const texture = this.textures.get(bank)!;
    const atlas = this.atlases[bank];
    const rect = atlas.frames[frame];
    const geometryKey = rect.strips ? key : 'rectangle';
    if (!this.geometries.has(geometryKey)) {
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      for (const [x, y, width, height] of rect.strips!) {
        const left = (x - rect.x) / rect.width;
        const right = (x + width - rect.x) / rect.width;
        const top = 1 - (y - rect.y) / rect.height;
        const bottom = 1 - (y + height - rect.y) / rect.height;
        const first = positions.length / 3;
        for (const [u, v] of [[left, bottom], [right, bottom], [right, top], [left, top]]) {
          positions.push(u - .5, v - .5, 0);
          uvs.push(u, v);
        }
        indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      this.geometries.set(geometryKey, geometry);
    }
    this.mesh.geometry = this.geometries.get(geometryKey)!;
    const cellWidth = atlas.width / 4;
    const cellHeight = atlas.height / 2;
    const units = 2.22 / cellHeight;
    // Read each complete silhouette, including hands extending past the nominal
    // grid. The source pixels and alpha stay untouched; neighboring poses are excluded.
    texture.repeat.set(rect.width / atlas.width, rect.height / atlas.height);
    texture.offset.set(rect.x / atlas.width, 1 - (rect.y + rect.height) / atlas.height);
    this.layout = {
      width: rect.width * units,
      height: rect.height * units,
      x: (rect.x + rect.width / 2 - (frame % 4 + .5) * cellWidth) * units,
      y: ((Math.floor(frame / 4) + .5) * cellHeight - rect.y - rect.height / 2) * units,
    };
    const firstMap = this.mesh.material.map === null;
    this.mesh.material.map = texture;
    if (firstMap) this.mesh.material.needsUpdate = true;
  }

  update(state: FighterState, delta: number, visualY = state.y) {
    if (this.loadFailure) throw this.loadFailure;
    if (!this.loaded) return;
    this.elapsed += delta;
    const pose = selectFighterPose(state, this.elapsed);
    const motion = this.kinetics.update(state, delta);
    this.setPose(pose.bank, pose.frame);
    this.mesh.scale.x = state.facing * this.layout.width;
    // Crouching, footwork and attack anticipation are drawn poses, not a squashed body.
    this.mesh.scale.y = this.layout.height * (1 + (pose.bank === 'base' && pose.frame === 0 ? Math.sin(this.elapsed * 2.6) * .004 : 0));
    this.mesh.position.x = this.layout.x * state.facing + motion.x;
    this.mesh.position.y = 2.22 * .42 + this.layout.y + visualY + motion.y;
    this.mesh.rotation.z = motion.lean;
    if (state.health <= 0 || state.knockdown > 0) {
      this.mesh.rotation.z = state.facing * .55;
      this.mesh.position.y = .7 + visualY;
    }
    this.shadow.scale.set(1 + visualY * .3, .5 + visualY * .1, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(.1, .48 - visualY * .3);
  }

  /** Upload every bank before the round, avoiding a first-punch texture hitch. */
  prepare(renderer: THREE.WebGLRenderer) {
    if (this.disposed) return;
    this.textures.forEach(texture => renderer.initTexture(texture));
    // Cache cutout meshes before play so overlap cleanup never allocates on a hit.
    for (const bank of ['base', 'motion', 'combat'] as const) {
      for (let frame = 0; frame < 8; frame++) this.setPose(bank, frame);
    }
    this.setPose('base', 0);
  }

  resetMotion() { this.kinetics = new FighterKinetics(); this.elapsed = 0; }

  dispose() {
    this.disposed = true;
    this.textures.forEach(texture => texture.dispose());
    this.geometries.forEach(geometry => geometry.dispose());
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        if (child !== this.mesh) child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => material.dispose());
      }
    });
  }
}
