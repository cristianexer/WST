import { createMatch, stepMatch, moves, isSignatureAction } from '../../../../packages/combat-core/src';
import type { ActionId, MatchState, SpecialId } from '../../../../packages/combat-core/src';
export interface ReplayData {version:5;id:string;createdAt:string;seed:number;player:string;opponent:string;specials:[SpecialId,SpecialId];controller:'laya'|'baseline';inputs:[ActionId,ActionId][];winner:0|1|'draw'|null;wins:[number,number]}
const KEY='wst.replays.v5';
export function readReplays():ReplayData[]{try{const rows:unknown=JSON.parse(localStorage.getItem(KEY)??'[]');return Array.isArray(rows)?rows.filter(isReplay).slice(0,5):[];}catch{return [];}}
function isReplay(value:unknown):value is ReplayData{
  if(!value||typeof value!=='object')return false;
  const item=value as Record<string,unknown>;
  const text=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<160;
  const tuple=(v:unknown)=>Array.isArray(v)&&v.length===2;
  const action=(v:unknown)=>typeof v==='string'&&Object.hasOwn(moves,v);
  return item.version===5&&text(item.id)&&text(item.createdAt)&&text(item.player)&&text(item.opponent)
    &&Number.isSafeInteger(item.seed)&&(item.seed as number)>=0
    &&(item.controller==='laya'||item.controller==='baseline')
    &&tuple(item.specials)&&(item.specials as unknown[]).every(v=>typeof v==='string'&&(v==='special_papers'||v==='special_veto'||isSignatureAction(v)))
    &&tuple(item.wins)&&(item.wins as unknown[]).every(v=>Number.isInteger(v)&&(v as number)>=0&&(v as number)<=3)
    &&(item.winner===0||item.winner===1||item.winner==='draw'||item.winner===null)
    &&Array.isArray(item.inputs)&&item.inputs.length>0&&item.inputs.length<=120_000
    &&item.inputs.every(v=>tuple(v)&&v.every(action));
}
export function saveReplay(replay:ReplayData):boolean{try{const list=[replay,...readReplays().filter(x=>x.id!==replay.id)].slice(0,5);localStorage.setItem(KEY,JSON.stringify(list));return true;}catch{return false;}}
export function clearReplays(){try{localStorage.removeItem(KEY);}catch{/* unavailable */}}
export function replayState(replay:ReplayData,until=replay.inputs.length):MatchState{let state=createMatch({seed:replay.seed,fighters:[replay.player,replay.opponent],specials:replay.specials});for(let i=0;i<until;i++)state=stepMatch(state,replay.inputs[i]);return state;}
export function downloadReplay(replay:ReplayData){const blob=new Blob([JSON.stringify(replay)],{type:'application/json'});downloadBlob(blob,`wst-replay-${replay.id}.json`);}
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
