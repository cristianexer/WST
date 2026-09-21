import { describe, expect, it } from 'vitest';
import { createMatch, moves } from '../packages/combat-core/src';
import { selectFighterPose } from '../apps/web/src/game/fighter-animation';
describe('fighter animation clocks',()=>{
  it('walks through different poses even when the held combat action tick stays at one',()=>{
    const fighter=createMatch().fighters[0];fighter.action='advance';fighter.actionTick=1;
    const poses=[0,.12,.24,.36].map(time=>selectFighterPose(fighter,time));
    expect(new Set(poses.map(p=>`${p.bank}:${p.frame}`)).size).toBe(4);
  });
});

it('distinguishes jump, normal strike and signature animation phases',()=>{
  const fighter=createMatch().fighters[0];
  fighter.action='jump';fighter.actionTick=1;expect(selectFighterPose(fighter,0)).toEqual({bank:'motion',frame:5});
  fighter.y=.4;expect(selectFighterPose(fighter,0)).toEqual({bank:'motion',frame:6});
  fighter.y=0;fighter.action='light';fighter.actionTick=1;expect(selectFighterPose(fighter,0)).toEqual({bank:'combat',frame:0});
  fighter.actionTick=moves.light.startup+1;expect(selectFighterPose(fighter,0)).toEqual({bank:'base',frame:2});
  fighter.action=fighter.special;fighter.actionTick=1;expect(selectFighterPose(fighter,0)).toEqual({bank:'combat',frame:6});
  fighter.actionTick=26;expect(selectFighterPose(fighter,0)).toEqual({bank:'combat',frame:7});
});
