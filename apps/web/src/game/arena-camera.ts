import { ARENA_HALF_WIDTH } from '../../../../packages/combat-core/src';

/** Keep a fixed world reference: AI movement must never pan or zoom the player. */
export function arenaCameraFrame(aspect: number, fieldOfView: number) {
  const field = Math.tan(fieldOfView * Math.PI / 360);
  const safeAspect = Math.max(.1, aspect);
  // Include both arena walls plus room for hands and signature silhouettes.
  return { x: 0, distance: Math.max(6.9, (ARENA_HALF_WIDTH + .8) / (field * safeAspect)) };
}
