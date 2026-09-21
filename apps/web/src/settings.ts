import { defaultBindings } from './game/input';
export interface Settings {volume:number;radioVolume:number;muted:boolean;quality:'high'|'low';reducedMotion:boolean;bindings:Record<string,string>}
export function readSettings():Settings{const defaults:Settings={volume:.55,radioVolume:.55,muted:false,quality:'high',reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,bindings:{...defaultBindings}};try{return {...defaults,...JSON.parse(localStorage.getItem('wst.settings')??'{}')};}catch{return defaults;}}
export function storeSettings(settings:Settings){try{localStorage.setItem('wst.settings',JSON.stringify(settings));}catch{/* session settings still work */}}
