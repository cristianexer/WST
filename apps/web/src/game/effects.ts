import { signatureProfileForAction } from '../../../../packages/combat-core/src';
import * as THREE from 'three';

export interface CombatEventLike {
  type?: string;
  tick?: number;
  actor?: 0 | 1;
  target?: 0 | 1;
  damage?: number;
  action?: string;
  signatureId?: string;
}

interface ActiveEffect {
  group: THREE.Group;
  life: number;
  maxLife: number;
  kind: string;
  velocity: THREE.Vector3;
  spin: number;
  expansion: number;
}

const SIGNATURE_IDS = [
  'trump', 'xi', 'putin', 'modi', 'burnham', 'macron', 'merz', 'meloni', 'takaichi', 'mbs', 'erdogan',
  'lula', 'carney', 'sheinbaum', 'lee', 'prabowo', 'ramaphosa', 'albanese', 'milei', 'von-der-leyen', 'kim',
] as const;
type SignatureId = typeof SIGNATURE_IDS[number];

function glow(color: string, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}

function makeSpark(color: string): THREE.Mesh {
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), glow(color));
  spark.castShadow = false;
  return spark;
}

export class ArenaEffects {
  readonly group = new THREE.Group();
  private readonly active: ActiveEffect[] = [];
  private readonly seen = new Set<string>();
  private readonly reducedMotion: boolean;

  constructor(reducedMotion = false) {
    this.group.name = 'combat-effects';
    this.reducedMotion = reducedMotion;
  }

  sync(events: readonly CombatEventLike[] | undefined, positions: readonly number[]): void {
    if (!events?.length) return;
    events.forEach((event) => {
      const tick = event.tick ?? 0;
      const key = `${tick}:${event.type ?? 'event'}:${event.action ?? ''}:${event.signatureId ?? ''}:${event.actor ?? 0}:${event.target ?? ''}`;
      if (this.seen.has(key)) return;
      this.seen.add(key);
      if (this.seen.size > 256) {
        const oldest = this.seen.values().next().value;
        if (oldest) this.seen.delete(oldest);
      }
      const actor = positions[event.actor ?? 0] ?? 0;
      const target = positions[event.target ?? (event.actor === 0 ? 1 : 0)] ?? actor;
      this.spawn(event, actor, target);
    });
  }

  private spawn(event: CombatEventLike, actorX: number, targetX: number): void {
    const type = (event.type ?? '').toLowerCase();
    const signature = this.signatureId(event);
    if (signature && type === 'signature-release') {
      this.spawnSignature(signature, actorX, targetX);
      return;
    }
    if (type.includes('hit') || type.includes('damage') || type.includes('impact') || type.includes('counter')) {
      this.spawnImpact((actorX + targetX) / 2, type.includes('counter') ? '#fff3bd' : '#f4b36e', type.includes('counter'));
    } else if (type.includes('block') || type.includes('guard')) {
      this.spawnShield(targetX, '#40d6e2');
    } else if (type.includes('parry') || type.includes('veto')) {
      this.spawnShield(targetX, '#f0c775');
      this.spawnImpact(targetX, '#fff1ae', true);
    } else if (type.includes('throw')) {
      this.spawnImpact((actorX + targetX) / 2, '#d88cff', true);
    } else if (type.includes('special') || type.includes('paper')) {
      this.spawnSpecial(actorX, targetX);
    } else if (type.includes('jump') || type.includes('land') || type.includes('dash')) {
      this.spawnDust(actorX, type.includes('dash') ? '#49becb' : '#c6b28b');
    } else if (type.includes('round')) {
      this.spawnRoundRing('#d7b36b');
    }
  }

  private signatureId(event: CombatEventLike): SignatureId | null {
    const profile=event.action?signatureProfileForAction(event.action):undefined;
    if(profile)return profile.characterId;
    const values = [event.signatureId, event.action];
    for (const value of values) {
      if (!value) continue;
      const normalized = value.toLowerCase().replace(/[_\s]+/g, '-');
      const candidates = [
        normalized,
        normalized.replace(/^signature-/, ''),
        normalized.replace(/^leader-/, ''),
        normalized.replace(/-signature$/, ''),
      ];
      const found = candidates.find((candidate): candidate is SignatureId => SIGNATURE_IDS.includes(candidate as SignatureId));
      if (found) return found;
    }
    return null;
  }

  private spawnImpact(x: number, color: string, strong: boolean): void {
    const root = new THREE.Group();
    root.position.set(x, strong ? 1.05 : 0.92, 0.34);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(strong ? 0.32 : 0.24, 0.022, 6, 20), glow(color));
    ring.rotation.y = 0.12;
    root.add(ring);
    const count = this.reducedMotion ? 3 : strong ? 8 : 5;
    for (let index = 0; index < count; index += 1) {
      const spark = makeSpark(color);
      const angle = (Math.PI * 2 * index) / count + 0.14;
      spark.position.set(Math.cos(angle) * 0.16, Math.sin(angle) * 0.16, 0.02);
      root.add(spark);
    }
    this.add(root, strong ? 0.46 : 0.32, 'impact', new THREE.Vector3(0, 0.06, 0));
  }

  private spawnShield(x: number, color: string): void {
    const root = new THREE.Group();
    root.position.set(x, 1.02, 0.42);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.025, 7, 24, Math.PI * 1.42), glow(color, 0.92));
    arc.rotation.y = 0.1;
    arc.rotation.z = Math.PI * 0.26;
    root.add(arc);
    for (let index = 0; index < 5; index += 1) {
      const shard = makeSpark(color);
      shard.position.set(-0.24 + index * 0.12, -0.08 + Math.sin(index) * 0.17, 0.02);
      root.add(shard);
    }
    this.add(root, 0.34, 'shield', new THREE.Vector3(0, 0.02, 0));
  }

  private spawnSpecial(actorX: number, targetX: number): void {
    const root = new THREE.Group();
    root.position.set(actorX, 1.0, 0.34);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, Math.max(0.6, Math.abs(targetX - actorX)), 8), glow('#e0ba65', 0.9));
    line.rotation.z = Math.PI / 2;
    line.position.x = (targetX - actorX) / 2;
    root.add(line);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), glow('#b5f3e4', 0.85));
    orb.position.x = targetX - actorX;
    root.add(orb);
    this.add(root, 0.58, 'special', new THREE.Vector3(0, 0.01, 0));
  }

  private spawnDust(x: number, color: string): void {
    const root = new THREE.Group();
    root.position.set(x, 0.06, 0.18);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 5, 18), glow(color, 0.64));
    ring.rotation.x = Math.PI / 2;
    root.add(ring);
    this.add(root, 0.36, 'dust', new THREE.Vector3(0, 0.04, 0));
  }

  private spawnRoundRing(color: string): void {
    const root = new THREE.Group();
    root.position.set(0, 1.1, 0.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.022, 6, 28), glow(color, 0.85));
    ring.rotation.y = 0.1;
    root.add(ring);
    this.add(root, 0.72, 'round', new THREE.Vector3(0, 0, 0));
  }

  private visual(geometry: THREE.BufferGeometry, color: string, opacity = 0.92): THREE.Mesh {
    const value = new THREE.Mesh(geometry, glow(color, opacity));
    value.castShadow = false;
    value.receiveShadow = false;
    return value;
  }

  private markParticle(mesh: THREE.Object3D, velocity: THREE.Vector3, spin = 0): void {
    mesh.userData.effectVelocity = velocity;
    mesh.userData.effectSpin = spin;
  }

  private signatureOrigin(actorX: number, targetX: number, y = 1.0): { root: THREE.Group; direction: number } {
    const root = new THREE.Group();
    root.position.set(actorX, y, 0.38);
    return { root, direction: targetX >= actorX ? 1 : -1 };
  }

  private spawnSignature(id: SignatureId, actorX: number, targetX: number): void {
    switch (id) {
      case 'trump': this.signaturePaperFlurry(actorX, targetX); break;
      case 'xi': this.signaturePanelWave(actorX, targetX); break;
      case 'putin': this.signatureIceburst(actorX, targetX); break;
      case 'modi': this.signatureSaffronRings(actorX, targetX); break;
      case 'burnham': this.signatureShoulderShock(actorX, targetX); break;
      case 'macron': this.signatureBlueArc(actorX, targetX); break;
      case 'merz': this.signatureGroundHammer(actorX, targetX); break;
      case 'meloni': this.signaturePreciseBeam(actorX, targetX); break;
      case 'takaichi': this.signatureVioletPulse(actorX, targetX); break;
      case 'mbs': this.signatureGoldCrescent(actorX, targetX); break;
      case 'erdogan': this.signatureRedX(actorX, targetX); break;
      case 'lula': this.signatureGreenClap(actorX, targetX); break;
      case 'carney': this.signatureSteelBars(actorX, targetX); break;
      case 'sheinbaum': this.signatureTealGroundWave(actorX, targetX); break;
      case 'lee': this.signatureTwinBluePulses(actorX, targetX); break;
      case 'prabowo': this.signatureRedStomp(actorX, targetX); break;
      case 'ramaphosa': this.signatureGreenRing(actorX, targetX); break;
      case 'albanese': this.signatureEmeraldStars(actorX, targetX); break;
      case 'milei': this.signatureVioletSpirals(actorX, targetX); break;
      case 'von-der-leyen': this.signatureBlueGoldStars(actorX, targetX); break;
      case 'kim': this.signatureAmberEntranceWave(actorX, targetX); break;
    }
  }

  private signaturePaperFlurry(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.02);
    const count = this.reducedMotion ? 6 : 14;
    for (let index = 0; index < count; index += 1) {
      const paper = this.visual(new THREE.BoxGeometry(0.19, 0.018, 0.12), '#e7d6a9', 0.88);
      paper.position.set(direction * (0.1 + index * 0.1), -0.14 + Math.sin(index * 1.7) * 0.2, 0.01 + index * 0.01);
      paper.rotation.set(index * 0.23, index * 0.41, direction * (0.35 + index * 0.16));
      this.markParticle(paper, new THREE.Vector3(direction * (0.34 + index * 0.03), 0.26 + (index % 3) * 0.08, 0), direction * (1.5 + index * 0.11));
      root.add(paper);
    }
    const seal = this.visual(new THREE.TorusGeometry(0.16, 0.018, 6, 24), '#e8ad62', 0.8);
    seal.rotation.y = 0.08;
    root.add(seal);
    this.add(root, 0.86, 'signature-paper-flurry', new THREE.Vector3(direction * 0.05, 0, 0), direction * 0.35, 0.8);
  }

  private signaturePanelWave(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.05);
    const count = this.reducedMotion ? 2 : 4;
    for (let index = 0; index < count; index += 1) {
      const arc = this.visual(new THREE.TorusGeometry(0.34 + index * 0.18, 0.024, 7, 32, Math.PI * 0.72), index % 2 === 0 ? '#c94a45' : '#d7aa39', 0.83);
      arc.rotation.y = direction * 0.1;
      arc.rotation.z = direction * (Math.PI * 0.5 - 0.2);
      arc.position.x = direction * (index * 0.12);
      root.add(arc);
    }
    const core = this.visual(new THREE.BoxGeometry(0.04, 0.86, 0.2), '#edcf76', 0.7);
    core.position.x = direction * 0.16;
    root.add(core);
    this.add(root, 0.62, 'signature-panel-wave', new THREE.Vector3(direction * 0.32, 0.015, 0), direction * 0.25, 1.2);
  }

  private signatureIceburst(actorX: number, targetX: number): void {
    const { root } = this.signatureOrigin(actorX, targetX, 1.03);
    const core = this.visual(new THREE.IcosahedronGeometry(0.17, 1), '#c8eff7', 0.88);
    root.add(core);
    const count = this.reducedMotion ? 5 : 9;
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count;
      const shard = this.visual(new THREE.ConeGeometry(0.06, 0.46, 5), '#83bed3', 0.78);
      shard.position.set(Math.cos(angle) * 0.2, Math.sin(angle) * 0.2, 0);
      shard.rotation.z = angle - Math.PI / 2;
      this.markParticle(shard, new THREE.Vector3(Math.cos(angle) * 0.3, Math.sin(angle) * 0.3, 0), 1.3);
      root.add(shard);
    }
    this.add(root, 0.64, 'signature-iceburst', new THREE.Vector3(), 0.5, 1.1);
  }

  private signatureSaffronRings(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.02);
    const count = this.reducedMotion ? 2 : 4;
    for (let index = 0; index < count; index += 1) {
      const ring = this.visual(new THREE.TorusGeometry(0.17 + index * 0.18, 0.025, 7, 36), '#e2af4f', 0.86 - index * 0.08);
      ring.rotation.y = direction * 0.1;
      ring.position.z = -index * 0.015;
      root.add(ring);
    }
    this.add(root, 0.74, 'signature-saffron-rings', new THREE.Vector3(), 0.6, 2.2);
  }

  private signatureShoulderShock(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.38);
    const count = this.reducedMotion ? 1 : 2;
    for (let index = 0; index < count; index += 1) {
      const ring = this.visual(new THREE.TorusGeometry(0.17 + index * 0.1, 0.028, 7, 28), '#d94d60', 0.9 - index * 0.12);
      ring.rotation.y = direction * 0.12;
      ring.position.x = direction * (0.13 + index * 0.06);
      root.add(ring);
    }
    const flare = this.visual(new THREE.SphereGeometry(0.08, 10, 8), '#ffadbc', 0.9);
    flare.position.x = direction * 0.2;
    root.add(flare);
    this.add(root, 0.5, 'signature-shoulder-shock', new THREE.Vector3(direction * 0.2, 0, 0), direction * 0.7, 1.4);
  }

  private signatureBlueArc(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.04);
    const arc = this.visual(new THREE.TorusGeometry(0.54, 0.04, 7, 38, Math.PI * 0.95), '#4c93e8', 0.9);
    arc.rotation.y = direction * 0.12;
    arc.rotation.z = direction * -0.35;
    root.add(arc);
    const pin = this.visual(new THREE.SphereGeometry(0.075, 10, 8), '#b8d9ff', 0.95);
    pin.position.x = direction * 0.43;
    pin.position.y = 0.24;
    root.add(pin);
    this.add(root, 0.6, 'signature-blue-arc', new THREE.Vector3(direction * 0.14, 0.02, 0), direction * 0.9, 0.75);
  }

  private signatureGroundHammer(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 0.08);
    const ring = this.visual(new THREE.TorusGeometry(0.2, 0.035, 6, 30), '#8d94aa', 0.92);
    ring.rotation.x = Math.PI / 2;
    root.add(ring);
    const count = this.reducedMotion ? 3 : 6;
    for (let index = 0; index < count; index += 1) {
      const spike = this.visual(new THREE.BoxGeometry(0.04, 0.28 + index * 0.045, 0.035), '#c5cad4', 0.8);
      spike.position.set(direction * (0.22 + index * 0.13), 0.12, 0.01);
      spike.rotation.z = direction * (0.25 + index * 0.08);
      this.markParticle(spike, new THREE.Vector3(direction * 0.12, 0.3 + index * 0.02, 0), 0.4);
      root.add(spike);
    }
    this.add(root, 0.66, 'signature-ground-hammer', new THREE.Vector3(direction * 0.1, 0, 0), direction * 0.35, 1.2);
  }

  private signaturePreciseBeam(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.12);
    const distance = Math.max(0.95, Math.abs(targetX - actorX));
    const beam = this.visual(new THREE.CylinderGeometry(0.035, 0.055, distance, 8), '#ee886e', 0.86);
    beam.rotation.z = Math.PI / 2;
    beam.position.x = direction * distance / 2;
    root.add(beam);
    const point = this.visual(new THREE.SphereGeometry(0.11, 12, 8), '#ffc0ac', 0.92);
    point.position.x = direction * distance;
    root.add(point);
    this.add(root, 0.48, 'signature-precise-beam', new THREE.Vector3(direction * 0.04, 0, 0), 0.2, 0.2);
  }

  private signatureVioletPulse(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.03);
    const orb = this.visual(new THREE.SphereGeometry(0.18, 14, 10), '#b68dff', 0.82);
    root.add(orb);
    const ring = this.visual(new THREE.TorusGeometry(0.3, 0.03, 7, 30), '#8256ca', 0.84);
    ring.rotation.y = direction * 0.12;
    root.add(ring);
    this.add(root, 0.66, 'signature-violet-pulse', new THREE.Vector3(), 1.4, 1.8);
  }

  private signatureGoldCrescent(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.03);
    const crescent = this.visual(new THREE.TorusGeometry(0.54, 0.055, 8, 36, Math.PI * 0.62), '#e3b85b', 0.9);
    crescent.rotation.y = direction * 0.12;
    crescent.rotation.z = direction * 0.65;
    root.add(crescent);
    this.markParticle(crescent, new THREE.Vector3(direction * 0.26, 0.02, 0), direction * 1.8);
    this.add(root, 0.64, 'signature-gold-crescent', new THREE.Vector3(direction * 0.15, 0, 0), direction * 1.0, 0.8);
  }

  private signatureRedX(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.0);
    for (const angle of [-0.75, 0.75]) {
      const bar = this.visual(new THREE.BoxGeometry(0.75, 0.055, 0.045), '#df5b57', 0.9);
      bar.rotation.z = direction * angle;
      root.add(bar);
    }
    const core = this.visual(new THREE.SphereGeometry(0.085, 10, 8), '#ffb1a1', 0.9);
    root.add(core);
    this.add(root, 0.52, 'signature-red-x', new THREE.Vector3(direction * 0.25, 0, 0), direction * 0.6, 0.85);
  }

  private signatureGreenClap(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.04);
    for (const side of [-1, 1]) {
      const panel = this.visual(new THREE.BoxGeometry(0.32, 0.52, 0.055), '#67c686', 0.82);
      panel.position.x = side * 0.34;
      panel.rotation.z = side * 0.22;
      this.markParticle(panel, new THREE.Vector3(-side * 0.4, 0, 0), -side * 1.6);
      root.add(panel);
    }
    this.add(root, 0.55, 'signature-green-clap', new THREE.Vector3(direction * 0.12, 0, 0), direction * 0.25, 0.8);
  }

  private signatureSteelBars(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.72);
    const count = this.reducedMotion ? 2 : 3;
    for (let index = 0; index < count; index += 1) {
      const bar = this.visual(new THREE.BoxGeometry(0.07, 0.92, 0.07), '#9ca6b0', 0.84);
      bar.position.set(direction * (0.18 + index * 0.22), 0.24, 0.02);
      this.markParticle(bar, new THREE.Vector3(0, -0.65 - index * 0.06, 0), direction * 0.7);
      root.add(bar);
    }
    this.add(root, 0.7, 'signature-steel-bars', new THREE.Vector3(direction * 0.08, 0, 0), direction * 0.2, 0.4);
  }

  private signatureTealGroundWave(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 0.06);
    const count = this.reducedMotion ? 2 : 4;
    for (let index = 0; index < count; index += 1) {
      const wave = this.visual(new THREE.TorusGeometry(0.18 + index * 0.16, 0.023, 6, 28), '#43c9c0', 0.82 - index * 0.08);
      wave.rotation.x = Math.PI / 2;
      wave.position.x = direction * index * 0.18;
      root.add(wave);
    }
    this.add(root, 0.74, 'signature-teal-ground-wave', new THREE.Vector3(direction * 0.25, 0, 0), 0.35, 1.3);
  }

  private signatureTwinBluePulses(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.04);
    for (const side of [-1, 1]) {
      const orb = this.visual(new THREE.SphereGeometry(0.105, 12, 9), '#5fb5ff', 0.92);
      orb.position.set(direction * (0.14 + side * 0.12), side * 0.16, 0);
      this.markParticle(orb, new THREE.Vector3(direction * 0.58, side * 0.05, 0), side * 1.2);
      root.add(orb);
    }
    this.add(root, 0.62, 'signature-twin-blue-pulses', new THREE.Vector3(), 0.5, 1.0);
  }

  private signatureRedStomp(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 0.06);
    const ring = this.visual(new THREE.TorusGeometry(0.2, 0.04, 6, 28), '#dc5b4f', 0.9);
    ring.rotation.x = Math.PI / 2;
    root.add(ring);
    const count = this.reducedMotion ? 4 : 8;
    for (let index = 0; index < count; index += 1) {
      const shard = this.visual(new THREE.TetrahedronGeometry(0.07, 0), '#ef8a68', 0.78);
      const angle = (Math.PI * 2 * index) / count;
      shard.position.set(Math.cos(angle) * 0.25, 0.03, Math.sin(angle) * 0.15);
      this.markParticle(shard, new THREE.Vector3(Math.cos(angle) * 0.25, 0.25 + (index % 2) * 0.08, Math.sin(angle) * 0.08), 2.1);
      root.add(shard);
    }
    this.add(root, 0.63, 'signature-red-stomp', new THREE.Vector3(direction * 0.06, 0, 0), direction * 0.4, 1.6);
  }

  private signatureGreenRing(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.02);
    const ring = this.visual(new THREE.TorusGeometry(0.58, 0.045, 8, 40), '#4fd477', 0.88);
    ring.rotation.y = direction * 0.1;
    root.add(ring);
    const inner = this.visual(new THREE.TorusGeometry(0.32, 0.018, 6, 30), '#a7f5a7', 0.74);
    inner.rotation.y = direction * 0.1;
    root.add(inner);
    this.add(root, 0.7, 'signature-green-ring', new THREE.Vector3(direction * 0.16, 0, 0), direction * 0.7, 1.0);
  }

  private signatureEmeraldStars(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.0);
    const count = this.reducedMotion ? 3 : 6;
    for (let index = 0; index < count; index += 1) {
      const star = this.visual(new THREE.TetrahedronGeometry(0.095, 0), '#64d89b', 0.88);
      const angle = (Math.PI * 2 * index) / count;
      star.position.set(Math.cos(angle) * 0.32, Math.sin(angle) * 0.32, 0);
      this.markParticle(star, new THREE.Vector3(direction * 0.2 + Math.cos(angle) * 0.12, Math.sin(angle) * 0.12, 0), 2.2);
      root.add(star);
    }
    this.add(root, 0.68, 'signature-emerald-stars', new THREE.Vector3(direction * 0.12, 0, 0), direction * 0.5, 0.9);
  }

  private signatureVioletSpirals(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.03);
    const count = this.reducedMotion ? 1 : 2;
    for (let index = 0; index < count; index += 1) {
      const spiral = this.visual(new THREE.TorusGeometry(0.3 + index * 0.13, 0.025, 6, 36, Math.PI * 1.55), '#a27ae4', 0.84);
      spiral.rotation.y = direction * 0.14;
      spiral.rotation.z = direction * (index ? 0.75 : -0.75);
      root.add(spiral);
    }
    this.add(root, 0.8, 'signature-violet-spirals', new THREE.Vector3(direction * 0.08, 0, 0), direction * 1.8, 1.15);
  }

  private signatureBlueGoldStars(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.04);
    const count = this.reducedMotion ? 4 : 8;
    for (let index = 0; index < count; index += 1) {
      const color = index % 2 === 0 ? '#4e9ae8' : '#e0bb62';
      const star = this.visual(new THREE.OctahedronGeometry(0.07 + (index % 3) * 0.018, 0), color, 0.88);
      const angle = (Math.PI * 2 * index) / count;
      star.position.set(Math.cos(angle) * 0.34, Math.sin(angle) * 0.32, 0);
      this.markParticle(star, new THREE.Vector3(direction * 0.18 + Math.cos(angle) * 0.15, Math.sin(angle) * 0.12, 0), -direction * 1.6);
      root.add(star);
    }
    this.add(root, 0.76, 'signature-blue-gold-stars', new THREE.Vector3(direction * 0.1, 0, 0), direction * 0.35, 1.1);
  }

  private signatureAmberEntranceWave(actorX: number, targetX: number): void {
    const { root, direction } = this.signatureOrigin(actorX, targetX, 1.03);
    const count = this.reducedMotion ? 2 : 4;
    for (let index = 0; index < count; index += 1) {
      const wave = this.visual(new THREE.TorusGeometry(0.23 + index * 0.15, 0.028, 6, 32, Math.PI * 0.92), '#e3a64f', 0.86 - index * 0.08);
      wave.rotation.y = direction * 0.1;
      wave.rotation.z = direction * 0.26;
      wave.position.x = direction * index * 0.11;
      root.add(wave);
    }
    const centre = this.visual(new THREE.SphereGeometry(0.1, 10, 8), '#ffe1a1', 0.9);
    root.add(centre);
    this.add(root, 0.7, 'signature-amber-entrance-wave', new THREE.Vector3(direction * 0.3, 0.01, 0), direction * 0.5, 1.3);
  }

  private add(group: THREE.Group, life: number, kind: string, velocity: THREE.Vector3, spin = 1.3, expansion = 0.7): void {
    const renderOrder = kind.startsWith('signature-') ? 8 : 2;
    group.traverse((child) => {
      child.renderOrder = renderOrder;
    });
    this.group.add(group);
    this.active.push({ group, life, maxLife: life, kind, velocity, spin, expansion });
    while (this.active.length > 36) {
      const stale = this.active.shift();
      if (stale) this.remove(stale);
    }
  }

  update(deltaSeconds: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const effect = this.active[index];
      effect.life -= deltaSeconds;
      const progress = 1 - Math.max(0, effect.life / effect.maxLife);
      effect.group.position.addScaledVector(effect.velocity, deltaSeconds);
      effect.group.rotation.z += effect.spin * deltaSeconds;
      effect.group.traverse((child) => {
        const particleVelocity = child.userData.effectVelocity;
        if (particleVelocity instanceof THREE.Vector3) child.position.addScaledVector(particleVelocity, deltaSeconds);
        const particleSpin = child.userData.effectSpin;
        if (typeof particleSpin === 'number') {
          child.rotation.x += particleSpin * deltaSeconds;
          child.rotation.y += particleSpin * 0.57 * deltaSeconds;
          child.rotation.z += particleSpin * 0.31 * deltaSeconds;
        }
      });
      const baseExpansion = effect.kind.startsWith('signature-') ? effect.expansion : effect.kind === 'dust' || effect.kind === 'special' ? 1.25 : 0.7;
      const scale = 1 + progress * baseExpansion;
      effect.group.scale.setScalar(scale);
      effect.group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
          child.material.opacity = Math.max(0, 1 - progress);
        }
      });
      if (effect.life <= 0) {
        this.active.splice(index, 1);
        this.remove(effect);
      }
    }
  }

  private remove(effect: ActiveEffect): void {
    this.group.remove(effect.group);
    effect.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const material = child.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
      }
    });
  }

  reset(): void {
    this.seen.clear();
    this.active.splice(0).forEach((effect) => this.remove(effect));
  }

  dispose(): void {
    this.reset();
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const material = child.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
      }
    });
  }
}
