import type { FighterProfileId } from './fighter-profiles';

export type ActionId =
  | 'light'
  | 'body'
  | 'heavy'
  | 'low'
  | 'overhead'
  | 'anti_air'
  | 'air_kick'
  | 'throw'
  | 'throw_break'
  | 'parry'
  | 'special_veto'
  | 'special_papers'
  | SignatureId
  | 'dash_forward'
  | 'dash_back'
  | 'jump'
  | 'guard_high'
  | 'guard_low'
  | 'advance'
  | 'retreat'
  | 'crouch'
  | 'idle';

export type LegacySpecialId = 'special_veto' | 'special_papers';
export type SignatureId =
  | 'signature_executive_order'
  | 'signature_five_year_plan'
  | 'signature_icebreaker'
  | 'signature_summit_salute'
  | 'signature_northern_powerhouse'
  | 'signature_grand_gesture'
  | 'signature_fiscal_hammer'
  | 'signature_final_word'
  | 'signature_iron_tempo'
  | 'signature_vision_rush'
  | 'signature_crossroads'
  | 'signature_coalition_clap'
  | 'signature_market_correction'
  | 'signature_seismic_shift'
  | 'signature_quick_consensus'
  | 'signature_command_step'
  | 'signature_unity_circle'
  | 'signature_southern_cross'
  | 'signature_wild_card'
  | 'signature_union_of_force'
  | 'signature_grand_entrance';
export type SpecialId = LegacySpecialId | SignatureId;
export type Difficulty = 'beginner' | 'standard' | 'expert';
export type HitLevel =
  | 'high'
  | 'mid'
  | 'low'
  | 'overhead'
  | 'throw'
  | 'defence'
  | 'movement'
  | 'neutral'
  | 'special';

export interface Move {
  id: ActionId;
  name: string;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  staminaCost: number;
  meterCost: number;
  hitLevel: HitLevel;
  hitstun: number;
  blockstun: number;
  guardDamage: number;
  reach: number;
  cancelInto?: ActionId;
  cancelOpen?: number;
  cancelClose?: number;
  held?: boolean;
}

export interface BufferedAction {
  action: ActionId;
  ticks: number;
}

export interface FighterState {
  x: number;
  y: number;
  /** Deterministic horizontal velocity in arena metres per second. */
  velocityX: number;
  profileId: FighterProfileId;
  maxHealth: number;
  maxStamina: number;
  facing: 1 | -1;
  health: number;
  stamina: number;
  meter: number;
  action: ActionId;
  actionTick: number;
  stun: number;
  knockdown: number;
  combo: number;
  special: SpecialId;

  /** Engine state is exported for faithful local replay, but is omitted from policy observations. */
  staminaRegenDelay: number;
  recoveryLock: number;
  guardBroken: boolean;
  /** True only for a damaging strike, and therefore valid for combo cancels. */
  hitConnected: boolean;
  /** Prevents a single active hitbox from resolving more than once, including blocks. */
  hitResolved: boolean;
  /** True only when this action began through the exported confirmed cancel route. */
  comboContinuation: boolean;
  specialAbsorbed: boolean;
  buffered: BufferedAction | null;
  airTick: number;
  airTicksTotal: number;
  airDirection: -1 | 0 | 1;
  airAttackUsed: boolean;
  capturedBy: 0 | 1 | null;
  captureTicks: number;
  throwTarget: 0 | 1 | null;
}

export interface CombatEvent {
  type: string;
  tick: number;
  actor: 0 | 1;
  target?: 0 | 1;
  action?: ActionId;
  damage?: number;
  blocked?: boolean;
  counter?: boolean;
  combo?: number;
  outcome?: 0 | 1 | 'draw';
}

export interface MatchState {
  tick: number;
  round: number;
  phase: 'ready' | 'fight' | 'round-end' | 'match-end';
  phaseTicks: number;
  timer: number;
  fighters: [FighterState, FighterState];
  wins: [number, number];
  winner: 0 | 1 | 'draw' | null;
  events: CombatEvent[];
  seed: number;

  /** Global freeze in simulation ticks. Rendering may continue during hitstop. */
  hitstop: number;
  /** Seed stream state is serialized for replay determinism. */
  rngState: number;
  training: boolean;
}

export interface PublicFighterObservation {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  meter: number;
  xMm: number;
  yMm: number;
  facing: 1 | -1;
  grounded: boolean;
  knockedDown?: boolean;
  action: ActionId;
  actionPhase: 'neutral' | 'startup' | 'active' | 'recovery' | 'stun' | 'captured';
  actionTick: number;
  canAct: boolean;
  distanceToWallMm: number;
  special: SpecialId;
}

export interface MatchObservation {
  version: 1;
  tick: number;
  round: number;
  phase: MatchState['phase'];
  timer: number;
  self: PublicFighterObservation;
  opponent: PublicFighterObservation;
  distanceMm: number;
  history: ActionId[];
}
