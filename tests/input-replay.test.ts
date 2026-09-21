import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatch, stepMatch } from '../packages/combat-core/src';
import type { ActionId } from '../packages/combat-core/src';
import { defaultBindings, GameInput } from '../apps/web/src/game/input';
import { replayState } from '../apps/web/src/game/replay';
import type { ReplayData } from '../apps/web/src/game/replay';
const ready=()=>{let state=createMatch();for(let i=0;i<90;i++)state=stepMatch(state,['idle','idle']);return state;};
afterEach(()=>vi.unstubAllGlobals());
describe('physical input boundary',()=>{
  const input=()=>{vi.stubGlobal('navigator',{getGamepads:()=>[]});return new GameInput({...defaultBindings});};
  it('samples a press once so the engine alone owns the eight tick buffer',()=>{const keyboard=input();const state=ready();keyboard.down('KeyJ');expect(keyboard.consume(state)).toBe('light');expect(keyboard.consume(state)).toBe('idle');keyboard.down('KeyJ',true);expect(keyboard.consume(state)).toBe('idle');});
  it('cancels opposing directions and resolves directional attack modifiers',()=>{const keyboard=input();const state=ready();keyboard.down('KeyA');keyboard.down('KeyD');expect(keyboard.consume(state)).toBe('idle');keyboard.up('KeyA');keyboard.down('KeyK');expect(keyboard.consume(state)).toBe('overhead');keyboard.up('KeyD');keyboard.down('KeyS');keyboard.down('KeyJ');expect(keyboard.consume(state)).toBe('body');});
  it('prioritizes a legal special over simultaneous throw and attack',()=>{const keyboard=input();const state=ready();state.fighters[0].meter=100;keyboard.down('KeyJ');keyboard.down('KeyU');keyboard.down('KeyO');expect(keyboard.consume(state)).toBe(state.fighters[0].special);});
  it('accepts either attack button for an airborne kick',()=>{for(const code of ['KeyJ','KeyK']){const keyboard=input();const state=ready();state.fighters[0].y=.5;state.fighters[0].airTicksTotal=32;keyboard.down(code);expect(keyboard.consume(state)).toBe('air_kick');}});
  it('releases held controls and press edges on clear',()=>{const keyboard=input();const state=ready();keyboard.down('KeyD');keyboard.down('KeyK');keyboard.clear();expect(keyboard.consume(state)).toBe('idle');});
});
it('replays actual applied inputs with exactly the original result',()=>{let state=createMatch({seed:712,fighters:['trump','xi'],specials:['special_papers','special_veto']});const inputs:[ActionId,ActionId][]=[];for(let tick=0;tick<1600;tick++){const pair:[ActionId,ActionId]=[tick<200?'advance':tick%35===0?'heavy':'idle',tick<200?'advance':tick%30===0?'light':'idle'];inputs.push(pair);state=stepMatch(state,pair);}const replay:ReplayData={version:5,id:'test',createdAt:'2026-09-21',seed:712,player:'trump',opponent:'xi',specials:['special_papers','special_veto'],controller:'baseline',inputs,winner:state.winner,wins:state.wins};expect(replayState(replay)).toEqual(state);});

describe('device-aware model scheduling', () => {
  it('allows measured slow inference without changing the baseline deadline', async () => {
    const { decisionTiming } = await import('../apps/web/src/game/ai-timing');
    expect(decisionTiming('baseline', 9_000).expiryMs).toBe(250);
    const slow = decisionTiming('laya', 2_400);
    expect(slow.cadenceTicks).toBe(144);
    expect(slow.expiryMs).toBe(4_800);
    expect(slow.expiryTicks).toBe(288);
    expect(decisionTiming('laya', 60_000).expiryMs).toBe(30_000);
    expect(decisionTiming('laya', NaN).expiryMs).toBe(3_000);
  });
});

it('releases a disconnected gamepad without releasing a held keyboard direction',()=>{
  let pad:unknown={axes:[1,0],buttons:[]};
  vi.stubGlobal('navigator',{getGamepads:()=>[pad]});
  const keyboard=new GameInput({...defaultBindings});const state=ready();
  expect(keyboard.consume(state)).toBe('advance');
  pad=null;expect(keyboard.consume(state)).toBe('idle');
  keyboard.down('KeyD');pad={axes:[1,0],buttons:[]};keyboard.consume(state);
  pad=null;expect(keyboard.consume(state)).toBe('advance');
});

it('ignores incompatible or corrupt saved replay rows',async()=>{
  const {readReplays}=await import('../apps/web/src/game/replay');
  const valid={version:5,id:'saved',createdAt:'2026-09-21',seed:712,player:'trump',opponent:'xi',specials:['special_papers','special_veto'],controller:'baseline',inputs:[['idle','idle']],winner:1,wins:[0,2]};
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify([valid,{...valid,version:0},{...valid,inputs:[['invented','idle']]},{...valid,specials:null}])});
  expect(readReplays()).toEqual([valid]);
});
