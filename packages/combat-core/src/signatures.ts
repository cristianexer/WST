import type { HitLevel, Move, SignatureId } from './types';

export type CharacterId =
  | 'trump' | 'xi' | 'putin' | 'modi' | 'burnham' | 'macron' | 'merz'
  | 'meloni' | 'takaichi' | 'mbs' | 'erdogan' | 'lula' | 'carney'
  | 'sheinbaum' | 'lee' | 'prabowo' | 'ramaphosa' | 'albanese' | 'milei'
  | 'von-der-leyen' | 'kim';

export type SignatureKind = 'strike' | 'zone' | 'rush' | 'launcher' | 'drain' | 'shield' | 'counter';

export interface SignatureMechanics {
  kind: SignatureKind;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  staminaCost: number;
  meterCost: 100;
  hitLevel: HitLevel;
  hitstun: number;
  blockstun: number;
  guardDamage: number;
  reach: number;
  hitstop: number;
  pushback: number;
  /** Total forward displacement during active rush frames. */
  travel: number;
  /** Extra stamina removed on a clean hit. */
  staminaDamage: number;
  /** Opponent meter removed on a clean hit. */
  meterDrain: number;
  /** Minimum knockdown ticks applied on a clean hit. */
  knockdown: number;
  /** Stun applied to a strike caught during active counter frames. */
  counterStun: number;
}

export interface SignatureProfile extends SignatureMechanics {
  characterId: CharacterId;
  id: SignatureId;
  name: string;
  description: string;
  color: string;
  audioCue: `signature.${CharacterId}`;
  fxCue: `signature.${CharacterId}`;
}

const profile = (
  characterId: CharacterId,
  id: SignatureId,
  name: string,
  description: string,
  color: string,
  mechanics: SignatureMechanics,
): SignatureProfile => Object.freeze({
  characterId,
  id,
  name,
  description,
  color,
  audioCue: `signature.${characterId}`,
  fxCue: `signature.${characterId}`,
  ...mechanics,
});

const strike = (overrides: Partial<SignatureMechanics> = {}): SignatureMechanics => ({
  kind: 'strike', startup: 18, active: 3, recovery: 28, damage: 135, staminaCost: 12,
  meterCost: 100, hitLevel: 'mid', hitstun: 35, blockstun: 16, guardDamage: 24,
  reach: 1.3, hitstop: 8, pushback: 0.45, travel: 0, staminaDamage: 0,
  meterDrain: 0, knockdown: 0, counterStun: 0, ...overrides,
});

/** Stable character-keyed data used by combat, renderer, HUD, VFX and audio. */
export const signatureProfiles: Readonly<Record<CharacterId, SignatureProfile>> = Object.freeze({
  trump: profile('trump', 'signature_executive_order', 'Executive Order', 'A paper barrage controls a long lane.', '#d64b3f', strike({ kind: 'zone', startup: 22, active: 4, recovery: 32, damage: 142, reach: 1.85, hitstun: 38, blockstun: 18, guardDamage: 25, hitstop: 9, pushback: 0.6 })),
  xi: profile('xi', 'signature_five_year_plan', 'Five-Year Plan', 'Red and gold panels absorb one incoming strike.', '#d7aa39', strike({ kind: 'shield', startup: 7, active: 24, recovery: 21, damage: 0, staminaCost: 8, hitLevel: 'special', hitstun: 0, blockstun: 0, guardDamage: 0, reach: 0, hitstop: 6, pushback: 0 })),
  putin: profile('putin', 'signature_icebreaker', 'Icebreaker', 'A rotating backfist punishes attacks committed into its counter window.', '#9bd5e8', strike({ kind: 'counter', startup: 5, active: 8, recovery: 27, damage: 92, staminaCost: 10, hitLevel: 'high', hitstun: 30, guardDamage: 18, reach: 1.05, hitstop: 8, pushback: 0.5, counterStun: 32 })),
  modi: profile('modi', 'signature_summit_salute', 'Summit Salute', 'An outward saffron wave reaches beyond ordinary strikes.', '#f2a23b', strike({ kind: 'zone', startup: 20, active: 5, recovery: 29, damage: 128, reach: 1.7, hitLevel: 'overhead', hitstun: 36, blockstun: 17, guardDamage: 22, pushback: 0.55 })),
  burnham: profile('burnham', 'signature_northern_powerhouse', 'Northern Powerhouse', 'A compact shoulder charge closes distance before impact.', '#d94d60', strike({ kind: 'rush', startup: 16, active: 6, recovery: 30, damage: 120, reach: 0.85, hitstun: 32, guardDamage: 21, travel: 0.6, pushback: 0.55 })),
  macron: profile('macron', 'signature_grand_gesture', 'Grand Gesture', 'A broad blue palm arc trades reach for a readable sweep.', '#5287dd', strike({ startup: 16, active: 5, recovery: 27, damage: 134, reach: 1.45, hitLevel: 'high', hitstun: 34, blockstun: 15, guardDamage: 21, hitstop: 8, pushback: 0.48 })),
  merz: profile('merz', 'signature_fiscal_hammer', 'Fiscal Hammer', 'An overhead double-fist slam launches on a clean hit.', '#8d94aa', strike({ kind: 'launcher', startup: 18, active: 4, recovery: 28, damage: 165, staminaCost: 15, hitLevel: 'overhead', hitstun: 44, blockstun: 19, guardDamage: 30, reach: 1.45, hitstop: 10, pushback: 0.5, knockdown: 34 })),
  meloni: profile('meloni', 'signature_final_word', 'Final Word', 'A precise coral palm reverses an incoming strike.', '#f16f6f', strike({ kind: 'counter', startup: 4, active: 6, recovery: 25, damage: 88, staminaCost: 9, hitLevel: 'mid', hitstun: 29, blockstun: 13, guardDamage: 17, reach: 0.95, hitstop: 7, pushback: 0.4, counterStun: 28 })),
  takaichi: profile('takaichi', 'signature_iron_tempo', 'Iron Tempo', 'A fast elbow rides a short violet pulse forward.', '#9b6bd3', strike({ kind: 'rush', startup: 13, active: 4, recovery: 27, damage: 105, staminaCost: 10, hitLevel: 'high', hitstun: 29, blockstun: 13, guardDamage: 17, reach: 0.8, hitstop: 7, pushback: 0.35, travel: 0.35 })),
  mbs: profile('mbs', 'signature_vision_rush', 'Vision Rush', 'A wide gold crescent advances through the middle lane.', '#e0bb55', strike({ kind: 'rush', startup: 15, active: 8, recovery: 28, damage: 144, staminaCost: 14, reach: 1, hitstun: 37, blockstun: 17, guardDamage: 25, hitstop: 9, pushback: 0.75, travel: 1.05 })),
  erdogan: profile('erdogan', 'signature_crossroads', 'Crossroads', 'Crossed forearms form a red defensive X.', '#d34848', strike({ kind: 'shield', startup: 6, active: 18, recovery: 19, damage: 0, staminaCost: 9, hitLevel: 'special', hitstun: 0, blockstun: 0, guardDamage: 0, reach: 0, hitstop: 7, pushback: 0 })),
  lula: profile('lula', 'signature_coalition_clap', 'Coalition Clap', 'A green thunderclap exhausts the opponent on contact.', '#48a868', strike({ kind: 'drain', startup: 16, active: 4, recovery: 29, damage: 98, staminaCost: 11, reach: 1.4, hitstun: 31, blockstun: 15, guardDamage: 23, hitstop: 8, pushback: 0.4, staminaDamage: 16 })),
  carney: profile('carney', 'signature_market_correction', 'Market Correction', 'A short steel-blue palm corrects overcommitted attacks.', '#6685a8', strike({ kind: 'counter', startup: 3, active: 5, recovery: 22, damage: 82, staminaCost: 8, hitLevel: 'mid', hitstun: 27, blockstun: 12, guardDamage: 16, reach: 0.85, hitstop: 7, pushback: 0.32, counterStun: 25 })),
  sheinbaum: profile('sheinbaum', 'signature_seismic_shift', 'Seismic Shift', 'A teal ground wave knocks opponents off their feet.', '#36b7a7', strike({ kind: 'launcher', startup: 21, active: 5, recovery: 30, damage: 138, staminaCost: 13, hitLevel: 'low', hitstun: 39, blockstun: 18, guardDamage: 26, reach: 1.65, hitstop: 9, pushback: 0.5, knockdown: 30 })),
  lee: profile('lee', 'signature_quick_consensus', 'Quick Consensus', 'Two quick blue pulses create a long active window.', '#4697df', strike({ startup: 11, active: 8, recovery: 25, damage: 120, staminaCost: 11, reach: 1.2, hitstun: 31, blockstun: 14, guardDamage: 20, hitstop: 7, pushback: 0.4 })),
  prabowo: profile('prabowo', 'signature_command_step', 'Command Step', 'A red ground stomp launches at close range.', '#c84f47', strike({ kind: 'launcher', startup: 18, active: 4, recovery: 34, damage: 125, staminaCost: 14, hitLevel: 'low', hitstun: 37, blockstun: 17, guardDamage: 24, reach: 1.3, hitstop: 9, pushback: 0.45, knockdown: 24 })),
  ramaphosa: profile('ramaphosa', 'signature_unity_circle', 'Unity Circle', 'A spreading green ring forms a patient guard.', '#5cac75', strike({ kind: 'shield', startup: 9, active: 30, recovery: 17, damage: 0, staminaCost: 7, hitLevel: 'special', hitstun: 0, blockstun: 0, guardDamage: 0, reach: 0, hitstop: 5, pushback: 0 })),
  albanese: profile('albanese', 'signature_southern_cross', 'Southern Cross', 'A diagonal uppercut ends in an emerald launch.', '#43b98a', strike({ kind: 'launcher', startup: 13, active: 4, recovery: 28, damage: 136, staminaCost: 12, hitLevel: 'mid', hitstun: 38, blockstun: 15, guardDamage: 22, reach: 1, hitstop: 9, pushback: 0.38, knockdown: 32 })),
  milei: profile('milei', 'signature_wild_card', 'Wild Card', 'A volatile double hook pulls a violet spiral forward.', '#a05ada', strike({ kind: 'rush', startup: 16, active: 7, recovery: 34, damage: 140, staminaCost: 15, hitLevel: 'high', hitstun: 37, blockstun: 18, guardDamage: 25, reach: 0.85, hitstop: 9, pushback: 0.55, travel: 0.58 })),
  'von-der-leyen': profile('von-der-leyen', 'signature_union_of_force', 'Union of Force', 'A blue and gold star ring denies one incoming strike.', '#5b83da', strike({ kind: 'shield', startup: 8, active: 22, recovery: 20, damage: 0, staminaCost: 8, hitLevel: 'special', hitstun: 0, blockstun: 0, guardDamage: 0, reach: 0, hitstop: 6, pushback: 0 })),
  kim: profile('kim', 'signature_grand_entrance', 'Grand Entrance', 'A dramatic amber stomp drains meter and stamina.', '#dfa33e', strike({ kind: 'drain', startup: 25, active: 4, recovery: 33, damage: 152, staminaCost: 15, hitLevel: 'low', hitstun: 41, blockstun: 19, guardDamage: 29, reach: 1.35, hitstop: 10, pushback: 0.58, staminaDamage: 16, meterDrain: 22, knockdown: 20 })),
});

export const signatureActionIds = Object.freeze(
  Object.values(signatureProfiles).map(({ id }) => id),
) as readonly SignatureId[];

const profilesByAction = new Map<SignatureId, SignatureProfile>(
  Object.values(signatureProfiles).map((item) => [item.id, item]),
);

export function signatureForCharacter(characterId: string): SignatureProfile {
  const result = signatureProfiles[characterId as CharacterId];
  if (!result) throw new Error(`Unknown signature character: ${characterId}`);
  return result;
}

export function signatureProfileForAction(action: string): SignatureProfile | undefined {
  return profilesByAction.get(action as SignatureId);
}

export function signatureMechanicsForAction(action: string): Readonly<SignatureMechanics> | undefined {
  const item = signatureProfileForAction(action);
  if (!item) return undefined;
  const {
    kind, startup, active, recovery, damage, staminaCost, meterCost, hitLevel, hitstun,
    blockstun, guardDamage, reach, hitstop, pushback, travel, staminaDamage, meterDrain,
    knockdown, counterStun,
  } = item;
  return {
    kind, startup, active, recovery, damage, staminaCost, meterCost, hitLevel, hitstun,
    blockstun, guardDamage, reach, hitstop, pushback, travel, staminaDamage, meterDrain,
    knockdown, counterStun,
  };
}

export function isSignatureAction(action: string): action is SignatureId {
  return profilesByAction.has(action as SignatureId);
}

export const signatureMoves: Readonly<Record<SignatureId, Move>> = Object.freeze(
  Object.fromEntries(Object.values(signatureProfiles).map((item) => [item.id, {
    id: item.id,
    name: item.name,
    startup: item.startup,
    active: item.active,
    recovery: item.recovery,
    damage: item.damage,
    staminaCost: item.staminaCost,
    meterCost: item.meterCost,
    hitLevel: item.hitLevel,
    hitstun: item.hitstun,
    blockstun: item.blockstun,
    guardDamage: item.guardDamage,
    reach: item.reach,
  }])) as Record<SignatureId, Move>,
);
