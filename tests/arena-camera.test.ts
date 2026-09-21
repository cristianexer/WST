import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMatch } from '../packages/combat-core/src';
import { ArenaRenderer } from '../apps/web/src/game/renderer';

// Exercise the production camera update without allocating a WebGL context or
// downloading art. Only GPU output and sprite/effect drawing are inert.
function cameraHarness() {
  const renderer: ArenaRenderer = Object.create(ArenaRenderer.prototype);
  Object.assign(renderer, {
    camera: new THREE.PerspectiveCamera(37, 16 / 9, .1, 60),
    visualPositions: [], visualRound: -1,
    visualTick: -1, elapsedSeconds: 0,
    fighters: [0, 1].map(() => ({group: new THREE.Group(), update() {}, resetMotion() {}})),
    effects: {reset() {}, update() {}}, scene: new THREE.Scene(), renderer: {render() {}},
  });
  const state = createMatch();
  return {
    render(playerX: number, opponentX: number) {
      state.fighters[0].x = playerX; state.fighters[1].x = opponentX;
      for (let i = 0; i < 240; i++) { state.tick++; renderer.render(state, 1 / 60); }
      renderer.camera.updateMatrixWorld();
      return new THREE.Vector3(playerX, 1.1, 0).project(renderer.camera).x;
    },
  };
}

describe('stable stage framing', () => {
  it('does not drag an idle player on screen when only the opponent moves', () => {
    const camera = cameraHarness();
    const before = camera.render(-2, 2);
    expect(camera.render(-2, -1.3)).toBeCloseTo(before, 8);
  });
  it('keeps retreat direction visible while the opponent pursues faster', () => {
    const camera = cameraHarness();
    const before = camera.render(-2, 2);
    expect(camera.render(-2.2, 1.4)).toBeLessThan(before);
  });
  it('keeps both arena walls visible', () => {
    const camera = cameraHarness();
    expect(Math.abs(camera.render(-6.7, 6.7))).toBeLessThan(.95);
    expect(Math.abs(camera.render(6.7, -6.7))).toBeLessThan(.95);
  });
});
