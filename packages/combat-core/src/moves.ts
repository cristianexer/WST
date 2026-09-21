import type { ActionId, Move } from './types';
import { signatureMoves } from './signatures';

const move = (
  id: ActionId,
  name: string,
  startup: number,
  active: number,
  recovery: number,
  damage: number,
  staminaCost: number,
  meterCost: number,
  hitLevel: Move['hitLevel'],
  hitstun: number,
  blockstun: number,
  guardDamage: number,
  reach: number,
  extra: Partial<Move> = {},
): Move => ({
  id,
  name,
  startup,
  active,
  recovery,
  damage,
  staminaCost,
  meterCost,
  hitLevel,
  hitstun,
  blockstun,
  guardDamage,
  reach,
  ...extra,
});

/** The 21 base actions, with feel-tuned timing expressed in deterministic 60 Hz ticks. */
const baseMoves = {
  light: move('light', 'Straight punch', 4, 2, 9, 45, 4, 0, 'high', 16, 10, 8, 0.9, {
    cancelInto: 'body',
    cancelOpen: 7,
    cancelClose: 11,
  }),
  body: move('body', 'Body punch', 7, 3, 12, 60, 6, 0, 'mid', 22, 12, 11, 0.85, {
    cancelInto: 'heavy',
    cancelOpen: 10,
    cancelClose: 16,
  }),
  heavy: move('heavy', 'Heavy cross', 12, 3, 18, 115, 12, 0, 'mid', 29, 13, 21, 1.15),
  low: move('low', 'Low kick', 9, 3, 16, 65, 8, 0, 'low', 24, 13, 12, 1.25),
  overhead: move('overhead', 'Overhead strike', 16, 3, 20, 100, 13, 0, 'overhead', 30, 15, 18, 1.05),
  anti_air: move('anti_air', 'Rising strike', 8, 4, 18, 85, 10, 0, 'mid', 30, 13, 15, 0.95),
  air_kick: move('air_kick', 'Air kick', 6, 4, 14, 70, 8, 0, 'overhead', 23, 13, 13, 1.15),
  throw: move('throw', 'Conference throw', 12, 2, 30, 105, 12, 0, 'throw', 42, 0, 0, 0.65),
  throw_break: move('throw_break', 'Break throw', 0, 1, 18, 0, 0, 0, 'defence', 0, 0, 0, 0),
  parry: move('parry', 'Veto parry', 3, 5, 24, 0, 10, 0, 'defence', 0, 0, 0, 0),
  special_veto: move('special_veto', 'Diplomatic shield', 8, 30, 18, 0, 0, 100, 'special', 0, 0, 0, 0),
  special_papers: move('special_papers', 'Paperwork burst', 24, 2, 36, 150, 15, 100, 'mid', 42, 18, 27, 1.4),
  dash_forward: move('dash_forward', 'Forward dash', 0, 10, 8, 0, 7, 0, 'movement', 0, 0, 0, 0),
  dash_back: move('dash_back', 'Back dash', 0, 10, 10, 0, 8, 0, 'movement', 0, 0, 0, 0),
  jump: move('jump', 'Jump', 2, 32, 8, 0, 5, 0, 'movement', 0, 0, 0, 0),
  guard_high: move('guard_high', 'High guard', 1, 1, 4, 0, 0, 0, 'defence', 0, 0, 0, 0, { held: true }),
  guard_low: move('guard_low', 'Low guard', 2, 1, 5, 0, 0, 0, 'defence', 0, 0, 0, 0, { held: true }),
  advance: move('advance', 'Advance', 0, 1, 0, 0, 0, 0, 'movement', 0, 0, 0, 0, { held: true }),
  retreat: move('retreat', 'Retreat', 0, 1, 0, 0, 0, 0, 'movement', 0, 0, 0, 0, { held: true }),
  crouch: move('crouch', 'Crouch', 2, 1, 4, 0, 0, 0, 'movement', 0, 0, 0, 0, { held: true }),
  idle: move('idle', 'Neutral idle', 0, 1, 0, 0, 0, 0, 'neutral', 0, 0, 0, 0, { held: true }),
} satisfies Partial<Record<ActionId, Move>>;

export const baseActionIds = Object.freeze(Object.keys(baseMoves) as ActionId[]);
export const moves: Record<ActionId, Move> = { ...baseMoves, ...signatureMoves } as Record<ActionId, Move>;
export const actionIds = Object.freeze(Object.keys(moves) as ActionId[]);
