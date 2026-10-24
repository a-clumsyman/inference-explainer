import {conversationReady} from './cafe/conversation.ts'
import {useMemo,useState} from 'react'
import {POOL,MAX_WORDS,type Customer} from './cafe/data.ts'
import {check,parseReply,shiftChecker,wordCount} from './cafe/check.ts'
import type {Engine} from './cafe/engine.ts'
import type {Run} from './Review.tsx'
import {Scene,usePlayer} from './cafe/Scene.tsx'
import {simulate} from './cafe/sim.ts'
export function Repair({run,index,instr,onInstrChange,engine,onDone}:{run:Run;index:number;instr:string;onInstrChange:(s:string)=>void;engine:Engine;onDone:()=>void}){
 const original=run.rows[index].c
 const [fresh,setFresh]=useState(false),[reply,setReply]=useState(''),[first,setFirst]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tested,setTested]=useState(false),[sent,setSent]=useState('')
 const prefix=run.rows.slice(0,index)
 const checker=shiftChecker();let state:ReturnType<typeof check>|undefined;for(const r of prefix)state=checker(r.c,r.reply,r.instructions??run.instructions)
 const baseState=state?{stock:{...state.stockAfter},booked:{...state.bookedAfter}}:undefined
 const alt=useMemo(()=>POOL.find(c=>c.id!==original.id&&c.group===original.group&&c.impossible===original.impossible&&!!c.clarify===!!original.clarify&&!!c.approval===!!original.approval&&c.req.t===original.req.t&&c.d<=Math.max(3,original.d)&&check(c,c.req.t==='order'?'Coming up!\nACTION: ORDER '+c.req.items.map(i=>`${i.name} x${i.qty}`).join(', '):c.req.t==='book'?`Booked.\nACTION: BOOK ${c.req.n} at ${c.req.time}`:'',baseState).deskOk!==false)??null,[run,index])
 const c:Customer=fresh&&alt?alt:original
 const v=reply?check(c,reply,baseState,sent):null
 const sim=useMemo(()=>simulate([...prefix.map(r=>r.c),...(reply?[c]:[])],[...prefix.map(r=>r.reply),...(reply?[reply]:[])],sent,false,[...prefix.map(r=>r.instructions),...(reply?[sent]:[])]),[reply,fresh])
 const pl=usePlayer(sim.events,0)
 async function attempt(continued=false){setBusy(true);setError('');const text=continued?sent:instr;setSent(text);try{const r=engine.replyFor?await engine.replyFor(text,c.id,false,baseState,continued,continued?first:undefined):await engine.reply(text,continued&&c.clarify?c.clarify:c.line);if(c.clarify&&!continued){setFirst('');if(conversationReady(c,parseReply(r).spoken,parseReply(r).action.t)){setFirst(r);setReply('');return}}setReply(continued?first+'\n--- CUSTOMER CHOICE ---\n'+r:r);setFirst('');setTested(!fresh);pl.setIdx(simulate(prefix.map(r=>r.c),prefix.map(r=>r.reply)).events.length);pl.resume()}catch(e){setError(String((e as Error).message)+' Nothing scored. Retry when available.')}finally{setBusy(false)}}
 return <section className="card"><h1>{fresh?'Fresh customer check':'Repair this moment'}</h1><p>{fresh?'A different customer, from the same pre-customer café state.':'Only this guest is retried. Earlier guests, stock and tables are rebuilt exactly from this run.'} This practice does not overwrite the shift or unlock a level.</p><p className="chip">{c.who}: {c.line}</p><label className="lab" htmlFor="repair-ins">Your instructions to the AI</label><textarea id="repair-ins" value={instr} disabled={busy||!!first} maxLength={2400} rows={5} onChange={e=>onInstrChange(e.target.value)}/><p>{wordCount(instr)} / {MAX_WORDS} words</p><button className="btn" disabled={busy||!wordCount(instr)||wordCount(instr)>MAX_WORDS} onClick={()=>attempt()}>{busy?'Waiting for free AI...':'Test this customer'}</button>{first&&<><blockquote>{parseReply(first).spoken}</blockquote><p>No ticket sent. Hear the customer before continuing.</p><button className="btn" disabled={busy} onClick={()=>attempt(true)}>Hear customer: {c.clarify}</button></>}{error&&<p className="bad">{error}</p>}{reply&&<><Scene shift={[...prefix.map(r=>r.c),c]} events={sim.events} idx={pl.idx}/><button className="btn ghost" onClick={pl.skip}>Skip animation</button><blockquote>{parseReply(reply.split('\n--- CUSTOMER CHOICE ---\n').at(-1)??reply).spoken}</blockquote><p className={v?.ok?'chip':v?.infra?'small':'bad'}>{v?.infra?'Unscored: ':v?.ok?'Checked: ':'Needs repair: '}{v?.note} {v?.system}</p></>}{tested&&!fresh&&alt&&<button className="btn" disabled={busy} onClick={()=>{setFresh(true);setReply('');setFirst('')}}>Face a fresh customer</button>}<button className="btn ghost" disabled={busy} onClick={onDone}>Back to the shift review</button></section>
}
