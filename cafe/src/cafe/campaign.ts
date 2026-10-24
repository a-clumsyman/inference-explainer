import { LEVELS,type Customer,type Level } from './data.ts'
import type { Verdict } from './check.ts'
export type Campaign={version:1;openingRule?:'quote-yes';previousOpeningBest?:number;cleared:number[];best:Record<string,number>}
export const campaignKey='corner-cafe-campaign-v1'
export const emptyCampaign=():Campaign=>({version:1,openingRule:'quote-yes',cleared:[],best:{}})
export function decodeCampaign(raw:string|null):Campaign{
 try{
  const x=JSON.parse(raw||'null')
  if(x?.version!==1||!Array.isArray(x.cleared)||!x.cleared.every((n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<LEVELS.length))return emptyCampaign()
  const current=x.openingRule==='quote-yes'
  const best=Object.fromEntries(Object.entries(x.best||{}).filter(([k,v])=>/^\d$/.test(k)&&typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=8&&(current||k!=='0'))) as Record<string,number>
  return {version:1,openingRule:'quote-yes',previousOpeningBest:current?x.previousOpeningBest:x.best?.[0],cleared:[...new Set<number>(x.cleared)].filter(n=>current||n!==0),best}
 }catch{return emptyCampaign()}
}
export function levelWon(rows:{v:Verdict}[],planned:number):boolean{return planned>0&&rows.length===planned&&rows.every(r=>r.v.ok&&!r.v.infra)}
export function unlocked(c:Campaign,n:number){return n===0||c.cleared.includes(n-1)}

/** Retained old shifts are history, not evidence for a different campaign level. */
export function matchesLevel(run:{planned:number;rows:{c:Customer}[];customers?:Customer[]},level:Level):boolean{
 const cs=run.customers??run.rows.map(r=>r.c)
 const expected=Object.entries(level.mix)
 return run.planned===expected.reduce((n,[,count])=>n+(count??0),0)&&cs.length===run.planned&&new Set(cs.map(c=>c.id)).size===cs.length&&cs.every(c=>(!c.approval||!!level.ids?.includes(c.id))&&c.d<=level.maxD&&(!level.ids||level.ids.includes(c.id)))&&expected.every(([group,count])=>cs.filter(c=>c.group===group).length===count)
}
