import { legalActions } from '../../../../packages/combat-core/src';
import type { ActionId, MatchState } from '../../../../packages/combat-core/src';
export const defaultBindings: Record<string,string> = {left:'KeyA',right:'KeyD',jump:'KeyW',crouch:'KeyS',light:'KeyJ',heavy:'KeyK',guard:'Space',dash:'KeyL',throw:'KeyU',parry:'KeyI',special:'KeyO'};
export const bindingLabels:Record<string,string> = {left:'Move left',right:'Move right',jump:'Jump',crouch:'Crouch',light:'Light attack',heavy:'Heavy attack',guard:'Guard',dash:'Dash',throw:'Throw / break',parry:'Parry',special:'Special'};
export function keyLabel(code:string){return code.replace('Key','').replace('Digit','').replace('Arrow','').replace('Space','SPACE');}
export class GameInput {
  held=new Set<string>(); private queued=new Map<string,number>(); private previousPad=new Set<string>();
  constructor(public bindings:Record<string,string>){ }
  down(code:string,repeat=false){this.held.add(code);if(!repeat)this.queued.set(code,5);}
  up(code:string){this.held.delete(code);}
  clear(){this.held.clear();this.queued.clear();this.previousPad.clear();}
  /** Current holds accompany every press so a released direction never latches in the worker. */
  heldAction(state:MatchState):ActionId {
    const held=new Set([...this.held,...this.previousPad]);
    const b=this.bindings,f=state.fighters[0];
    const left=held.has(b.left),right=held.has(b.right),down=held.has(b.crouch);
    const forward=f.facing===1?right&&!left:left&&!right;
    const back=f.facing===1?left&&!right:right&&!left;
    return held.has(b.guard)?down?'guard_low':'guard_high':down?'crouch':forward?'advance':back?'retreat':'idle';
  }
  consume(state:MatchState):ActionId {
    const pad=navigator.getGamepads?.()[0];
    if(pad){const active=new Set<string>();const b=this.bindings;
      if((pad.axes[0]??0)<-.35 || pad.buttons[14]?.pressed)active.add(b.left);
      if((pad.axes[0]??0)>.35 || pad.buttons[15]?.pressed)active.add(b.right);
      if((pad.axes[1]??0)>.5 || pad.buttons[13]?.pressed)active.add(b.crouch);
      [[0,'jump'],[1,'heavy'],[2,'light'],[3,'special'],[4,'parry'],[5,'guard'],[6,'throw'],[7,'dash']].forEach(([n,action])=>{if(pad.buttons[n as number]?.pressed)active.add(b[action as string]);});
      for(const code of active)if(!this.previousPad.has(code))this.queued.set(code,5);
      this.previousPad=active;
    }else this.previousPad.clear();
    const held=new Set([...this.held,...this.previousPad]);
    const b=this.bindings, f=state.fighters[0];
    const left=held.has(b.left),right=held.has(b.right),down=held.has(b.crouch);
    const forward=f.facing===1?right&&!left:left&&!right;
    const back=f.facing===1?left&&!right:right&&!left;
    const presses=f.capturedBy!==null?['throw','special','parry','heavy','light','dash','jump']:['special','parry','throw','heavy','light','dash','jump'];
    let result:ActionId|undefined;const candidates:ActionId[]=[];
    for(const key of presses)if(this.queued.has(b[key])){
      result=key==='throw'?(f.capturedBy!==null?'throw_break':'throw'):key==='special'?f.special:key==='heavy'?(f.y>0?'air_kick':down?'low':forward?'overhead':'heavy'):key==='light'?(f.y>0?'air_kick':down?'body':forward?'anti_air':'light'):key==='dash'?(back?'dash_back':'dash_forward'):key as ActionId;
      candidates.push(result);
    }
    const legal=legalActions(state,0);
    result=candidates.find(action=>legal.includes(action))??candidates[0];
    // Sample each physical edge exactly once. Combat core owns the eight-tick buffer.
    this.queued.clear();
    return result ?? this.heldAction(state);
  }
}
