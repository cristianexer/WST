import { fighterProfileForCharacter, type FighterStatKey } from '../../../../packages/combat-core/src';
import './fighter-stats.css';

const labels: Record<FighterStatKey, string> = {
  power: 'POWER', speed: 'SPEED', vitality: 'HEALTH', stamina: 'STAMINA', recovery: 'RECOVERY',
};
const explanations: Record<FighterStatKey, string> = {
  power: 'Damage multiplier for attacks and signatures', speed: 'Forward movement speed; also affects retreat, dash and air control',
  vitality: 'Maximum health', stamina: 'Maximum stamina', recovery: 'Stamina regeneration multiplier',
};
const valueFor = (key: FighterStatKey, value: number) => key === 'vitality' ? `${(value * 10).toLocaleString()} HP`
  : key === 'speed' ? `${(2.4 * value / 100).toFixed(2)} m/s`
  : key === 'stamina' ? `${value}` : `${(value / 100).toFixed(2)}×`;

export function FighterStats({ characterId }: { characterId: string }) {
  const profile = fighterProfileForCharacter(characterId);
  const stats = Object.entries(profile.stats) as [FighterStatKey, number][];
  return <section className="fighter-attributes" aria-label="Fighter attributes">
    <div className="attribute-heading"><strong>{profile.archetype.toUpperCase()}</strong><span>500 PT BUILD</span></div>
    {stats.map(([key, value]) => <div className="attribute-row" key={key} title={explanations[key]}>
      <span>{labels[key]}</span><div className="attribute-track" aria-hidden="true"><i style={{ width: `${value / 120 * 100}%` }}/><b/></div>
      <strong>{valueFor(key, value)}</strong>
    </div>)}
    <p>{profile.description}</p>
  </section>;
}
