import type { CSSProperties } from 'react';
import type { Character } from '../../../../packages/content/src';
export function Portrait({character,className=''}:{character:Character;className?:string}){
  return <div role="img" aria-label={`Generated game portrait of ${character.name}`} className={`portrait ${className}`} style={{'--portrait-x':`${character.index%7/6*100}%`,'--portrait-y':`${Math.floor(character.index/7)/2*100}%`} as CSSProperties}/>;
}
