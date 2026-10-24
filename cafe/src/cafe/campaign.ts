import { LEVELS } from './data.ts'
import type { Verdict } from './check.ts'
export type Campaign={version:1;cleared:number[];best:Record<string,number>}
export const campaignKey='corner-cafe-campaign-v1'
export const emptyCampaign=():Campaign=>({version:1,cleared:[],best:{}})
export function decodeCampaign(raw:string|null):Campaign{try{const x=JSON.parse(raw||'null');if(x?.version!==1||!Array.isArray(x.cleared)||!x.cleared.every((n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<LEVELS.length))return emptyCampaign();return {version:1,cleared:[...new Set<number>(x.cleared)],best:Object.fromEntries(Object.entries(x.best||{}).filter(([k,v])=>/^\d$/.test(k)&&typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=8)) as Record<string,number>}}catch{return emptyCampaign()}}
export function levelWon(rows:{v:Verdict}[],planned:number):boolean{return planned>0&&rows.length===planned&&rows.every(r=>r.v.ok&&!r.v.infra)}
export function unlocked(c:Campaign,n:number){return n===0||c.cleared.includes(n-1)}
