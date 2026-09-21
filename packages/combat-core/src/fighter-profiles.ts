import type { CharacterId } from './signatures';

export type FighterStatKey = 'power' | 'speed' | 'vitality' | 'stamina' | 'recovery';
export type FighterProfileId = CharacterId | 'neutral';

export interface FighterStats {
  power: number;
  speed: number;
  vitality: number;
  stamina: number;
  recovery: number;
}

export interface FighterProfile {
  id: FighterProfileId;
  label: string;
  archetype: string;
  description: string;
  stats: Readonly<FighterStats>;
}

function profile(
  id: CharacterId,
  label: string,
  archetype: string,
  description: string,
  [power, speed, vitality, stamina, recovery]: readonly [number, number, number, number, number],
): FighterProfile {
  return Object.freeze({
    id,
    label,
    archetype,
    description,
    stats: Object.freeze({ power, speed, vitality, stamina, recovery }),
  });
}

/** Five readable 85–115 indices; every character spends the same 500-point budget. */
export const fighterProfiles: Readonly<Record<CharacterId, FighterProfile>> = Object.freeze({
  trump: profile('trump', 'Trump', 'Power Broker', 'Heavy hits traded for lighter vitality and measured footwork.', [110, 95, 90, 100, 105]),
  xi: profile('xi', 'Xi Jinping', 'Enduring Planner', 'High vitality and stamina with measured movement.', [95, 95, 105, 110, 95]),
  putin: profile('putin', 'Putin', 'Counterweight', 'Firm damage with steady movement and modest recovery.', [105, 100, 95, 105, 95]),
  modi: profile('modi', 'Modi', 'Sustained Tempo', 'Mobile, balanced pressure with measured recovery.', [100, 105, 100, 100, 95]),
  burnham: profile('burnham', 'Burnham', 'Forward Driver', 'Power pressure with strong recovery and measured footwork.', [105, 90, 95, 100, 110]),
  macron: profile('macron', 'Macron', 'Mobile Technician', 'Fast recovery footwork with lighter hits and deep vitality.', [95, 105, 105, 85, 110]),
  merz: profile('merz', 'Merz', 'Fiscal Striker', 'Mobile heavy hits traded for lighter vitality and stamina.', [110, 105, 90, 85, 110]),
  meloni: profile('meloni', 'Meloni', 'Agile Rebuttal', 'Fast recovery and movement with a compact stamina bar.', [100, 105, 100, 90, 105]),
  takaichi: profile('takaichi', 'Takaichi', 'Tempo Specialist', 'Responsive movement with lighter hits and high vitality.', [95, 100, 105, 100, 100]),
  mbs: profile('mbs', 'Bin Salman', 'Power Sprinter', 'Strong pressure with lighter vitality and stamina.', [110, 100, 90, 90, 110]),
  erdogan: profile('erdogan', 'Erdoğan', 'Defensive Anchor', 'A balanced core with deep stamina and measured movement.', [100, 95, 100, 110, 95]),
  lula: profile('lula', 'Lula', 'Endurance Broker', 'Mobile stamina pressure with measured recovery.', [100, 105, 100, 105, 90]),
  carney: profile('carney', 'Carney', 'Recovery Analyst', 'Lighter hits offset by high vitality and strong recovery.', [90, 100, 110, 90, 110]),
  sheinbaum: profile('sheinbaum', 'Sheinbaum', 'Balanced Recovery', 'Measured all-round play with quick stamina recovery.', [95, 100, 105, 95, 105]),
  lee: profile('lee', 'Lee Jae Myung', 'Rapid Consensus', 'Fast movement and high vitality with light hits and a compact stamina bar.', [90, 110, 110, 85, 105]),
  prabowo: profile('prabowo', 'Prabowo', 'Command Striker', 'Highest power and fast pressure traded for low vitality.', [115, 105, 85, 90, 105]),
  ramaphosa: profile('ramaphosa', 'Ramaphosa', 'Unity Anchor', 'High vitality and recovery with lighter damage and measured movement.', [90, 95, 110, 100, 105]),
  albanese: profile('albanese', 'Albanese', 'Mobile All-Rounder', 'Fast movement with a balanced core and measured recovery.', [100, 110, 100, 95, 95]),
  milei: profile('milei', 'Milei', 'Glass Cannon', 'Highest power and responsive movement with the lowest vitality.', [115, 100, 85, 95, 105]),
  'von-der-leyen': profile('von-der-leyen', 'Von der Leyen', 'Endurance Coordinator', 'High vitality and stamina with measured movement.', [90, 95, 110, 110, 95]),
  kim: profile('kim', 'Kim Jong Un', 'Grand Endurer', 'High vitality and balanced reserves offset light damage.', [90, 100, 110, 100, 100]),
});

export const neutralFighterProfile: FighterProfile = Object.freeze({
  id: 'neutral',
  label: 'Neutral',
  archetype: 'All-Rounder',
  description: 'Even power, speed, vitality, stamina, and recovery.',
  stats: Object.freeze({ power: 100, speed: 100, vitality: 100, stamina: 100, recovery: 100 }),
});

/** Unknown and omitted IDs resolve neutrally so legacy and generic replays remain valid. */
export function fighterProfileForCharacter(characterId?: string | null): FighterProfile {
  if (!characterId || characterId === 'neutral') return neutralFighterProfile;
  if (!Object.prototype.hasOwnProperty.call(fighterProfiles, characterId)) return neutralFighterProfile;
  return fighterProfiles[characterId as CharacterId];
}
