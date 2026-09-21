import { moves, type FighterState } from '../../../../packages/combat-core/src';

/** Small continuous weight shifts between authored poses; never changes hitboxes. */
export class FighterKinetics {
  private lean = 0;
  private reach = 0;
  private landing = 0;
  private lastHeight = 0;
  private stride = 0;

  update(state: FighterState, delta: number) {
    const dt = Math.min(1 / 20, Math.max(0, delta));
    const velocity = state.velocityX;
    const speed = Math.abs(velocity);
    const moving = state.y === 0 && speed > .08 && state.stun === 0;
    const move = moves[state.action];
    const striking = move.damage > 0 && state.stun === 0;
    const active = striking && state.actionTick > move.startup && state.actionTick <= move.startup + move.active;
    const anticipating = striking && state.actionTick <= move.startup;
    const targetLean = (moving ? -Math.max(-1, Math.min(1, velocity / 2.4)) * .026 : 0)
      + (state.stun > 0 ? state.facing * .025 : active ? -state.facing * .018 : anticipating ? state.facing * .012 : 0);
    const targetReach = active ? .065 * state.facing : anticipating ? -.018 * state.facing : 0;
    if (dt > 0) {
      if (this.lastHeight > .01 && state.y === 0) this.landing = .035;
      this.lastHeight = state.y;
      this.stride += speed * dt * 6;
      this.landing *= Math.exp(-18 * dt);
      this.lean += (targetLean - this.lean) * (1 - Math.exp(-32 * dt));
      this.reach += (targetReach - this.reach) * (1 - Math.exp(-55 * dt));
    }
    return { lean: this.lean, x: this.reach, y: (moving ? Math.abs(Math.sin(this.stride)) * .012 : 0) - this.landing };
  }
}
