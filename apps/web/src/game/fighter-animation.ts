import type { FighterState } from '../../../../packages/combat-core/src';
import { moves } from '../../../../packages/combat-core/src';
export type PoseBank = 'base' | 'motion' | 'combat';
export interface FighterPose { bank: PoseBank; frame: number }
const pose=(bank:PoseBank,frame:number):FighterPose=>({bank,frame});
/** Locomotion uses elapsed time: held combat actions intentionally keep a fixed action tick. */
export function selectFighterPose(state:FighterState,elapsedSeconds:number):FighterPose {
  const {action,actionTick:tick}=state;
  const move=moves[action];
  const startup=tick<=move.startup;
  const active=tick<=move.startup+move.active;
  const earlyRecovery=tick<move.startup+move.active+Math.min(10,move.recovery*.7);
  if(state.health<=0||state.knockdown>0)return pose('base',7);
  if(state.stun>0)return pose('base',action.startsWith('guard')?5:7);
  if(action===state.special)return pose('combat',startup?6:7);
  if(action==='air_kick')return active&&!startup?pose('base',6):pose('motion',6);
  if(state.y>0)return pose('motion',6);
  if(action==='advance'||action==='retreat'||action.startsWith('dash'))return pose('motion',Math.floor(elapsedSeconds*(action.startsWith('dash')?14:9))%4);
  if(action==='crouch'||action==='guard_low')return pose('motion',4);
  if(action==='jump')return pose('motion',startup?5:7);
  if(action==='guard_high'||action==='parry')return pose('base',5);
  if(action==='low')return startup?pose('combat',4):active?pose('base',4):earlyRecovery?pose('combat',5):pose('base',0);
  if(['light','body'].includes(action))return startup?pose('combat',0):active?pose('base',2):earlyRecovery?pose('combat',1):pose('base',0);
  if(['heavy','overhead','anti_air','throw'].includes(action))return startup?pose('combat',2):active?pose('base',3):earlyRecovery?pose('combat',3):pose('base',0);
  return pose('base',0);
}
