import { useEffect, useMemo, useState } from 'react'
import { LESSONS, NOTICE, lessonCustomer, assessLesson } from './cafe/lessons.ts'
import { FACTS } from './cafe/data.ts'
import { hosted, standIn, lessonReply } from './cafe/engine.ts'
import { describeAction, parseReply, wordCount } from './cafe/check.ts'
import { simulate } from './cafe/sim.ts'
import { Scene, usePlayer } from './cafe/Scene.tsx'
import { BISCUIT } from './cafe/sprites.ts'
import { Story } from './Story.tsx'
import { muted, setMuted } from './cafe/sound.ts'

import { base, decodeLessonProgress, encodeLessonProgress, type Attempt, type Progress } from './cafe/lesson-save.ts'
const params=new URLSearchParams(location.search)
const isTest=params.get('standin')==='1'
const key='corner-cafe-lessons-v1'+(isTest?'-layout-test':'-hosted')
function Coach({children}:{children:React.ReactNode}){return <div className="lesson-coach"><img src={BISCUIT[0]} alt="Biscuit, the cat guide"/><p>{children}</p></div>}
function Playback({attempt}:{attempt:Attempt}){
 const customer=lessonCustomer(attempt.day,attempt.stage,attempt.continued)
 const pendingGate=(attempt.day===2||attempt.day===6)&&!attempt.continued
 // A gate must prevent an actual mutation even if the model prints an action.
 const sim=useMemo(()=>simulate([customer],[pendingGate?parseReply(attempt.reply).spoken+'\nACTION: NONE':attempt.reply],attempt.instructions),[attempt])
 const player=usePlayer(sim.events,0)
 useEffect(()=>{player.setIdx(0);player.resume()},[attempt])
 return <div><Scene shift={[customer]} events={sim.events} idx={player.idx}/><div className="ctl"><button className="btn ghost" onClick={player.paused?player.resume:player.pause}>{player.paused?'Resume animation':'Pause animation'}</button><button className="btn ghost" onClick={player.skip}>Skip animation</button></div></div>
}
export function Curriculum({onMixed}:{onMixed:()=>void}){
 const [p,setP]=useState<Progress>(()=>{try{return decodeLessonProgress(localStorage.getItem(key))??base()}catch{return base()}})
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[hint,setHint]=useState(false),[reset,setReset]=useState(false),[notice,setNotice]=useState(''),[sound,setSound]=useState(muted())
 const engine=useMemo(()=>isTest?standIn():hosted(),[])
 const lesson=LESSONS[p.day],dayAttempts=p.attempts.filter(a=>a.day===p.day), current=dayAttempts.filter(a=>a.stage===p.stage).at(-1)
 const assessment=current?(current.reply.includes('[fictional staff code disclosed]')?{kind:'gap',text:'The fictional staff code was disclosed. Its bytes were removed from this browser save.'}:assessLesson(p.day,p.stage,current.reply,current.continued)):null
 const patch=(v:Partial<Progress>)=>setP(old=>({...old,...v}))
 useEffect(()=>{try{const raw=encodeLessonProgress(p);if(raw===null){localStorage.removeItem(key);setNotice('Not saved: remove secret-like text. Do not enter passwords or personal secrets.')}else{localStorage.setItem(key,raw);setNotice('Saved on this browser only.')}}catch{setNotice('This browser could not save. Keep the tab open.')}},[p])
 const previous=p.attempts.filter(a=>a.day===p.day&&a.stage==='first').at(-1)
 const changed=p.instructions.trim()!==p.firstInstructions.trim()
 const safeText=wordCount(p.instructions)>0&&wordCount(p.instructions)<=90&&p.instructions.length<=2400
 async function run(continued=false){
  if(busy||!safeText)return
  setBusy(true);setError('')
  const snapshot={...p}
  try{
   await engine.load(()=>{})
   const reply=await lessonReply(engine,snapshot.instructions,snapshot.day,snapshot.stage,continued)
   const a:Attempt={day:snapshot.day,stage:snapshot.stage,continued,instructions:snapshot.instructions,reply,approved:continued&&snapshot.day===6}
   setP(old=>({...old,attempts:[...old.attempts,a].slice(-60),checked:false,choice:''}))
  }catch(e){setError(String((e as Error).message??e)+' No lesson is failed. Retry this exact step when the service is available.')}
  finally{setBusy(false)}
 }
 function revise(){patch({stage:'retry',firstInstructions:p.instructions,reflection:'',checked:false,approval:false,noticeAdded:false});setHint(false)}
 function fresh(){patch({stage:'fresh',reflection:'',checked:false,approval:false,noticeAdded:false,choice:''});setHint(false)}
 function selectDay(n:number){if(busy)return;patch({day:n,stage:'first',instructions:LESSONS[n].initial,firstInstructions:'',reflection:'',prediction:'',transfer:'',checked:false,approval:false,choice:'',noticeAdded:false});setHint(false);setError('')}
 const understands=p.reflection.trim().split(/\s+/).length>=4
 const gateDay=p.day===2||p.day===6
 const awaitsGate=!!current&&!current.continued&&gateDay
 const canContinue=!!current&&current.instructions===p.instructions&&(!gateDay||current.continued)&&assessment?.kind!=='gap'&&understands&&p.checked
 const needsEdit=p.stage==='retry'&&!changed
 const startDisabled=busy||!safeText||needsEdit||(p.day===4&&p.stage==='retry'&&p.prediction.trim().split(/\s+/).length<4)||(p.day===1&&p.stage!=='first'&&!p.noticeAdded)
 if(!p.started)return <main className="wrap"><header className="top"><span className="logo">CORNER CAFÉ</span><span className="tag">{isTest?'STAND-IN, NOT A MODEL':'REAL AI · FREE HOSTED'}</span></header><Story startLabel="Start the seven lessons" onStart={()=>patch({started:true})}/><section className="card"><h2>One lesson at a time. A real challenge.</h2><p>Write your own instructions, watch what happens, improve them and test a fresh customer. No automatic wins. Seven sessions, at your pace.</p><button className="btn" onClick={()=>patch({started:true})}>Go to Day 1</button><button className="btn ghost" onClick={onMixed}>Optional mixed shift</button></section></main>
 return <main className="wrap curriculum">
 <header className="top"><span className="logo">CORNER CAFÉ</span><span className="tag">{isTest?'STAND-IN, NOT A MODEL':'REAL AI · FREE HOSTED'}</span><button className="soundbtn" aria-label={sound?'Turn sound on':'Turn sound off'} onClick={()=>{setMuted(!sound);setSound(!sound)}}>{sound?'🔇':'🔊'}</button></header>
 <p className="small" role="status">Game text and progress only. No passwords or personal secrets. {notice}</p>
 <div className="lesson-nav" aria-label="Seven lessons">{LESSONS.map((l,i)=><button key={l.n} disabled={busy||i>Math.max(0,...p.completed.map(x=>x+1))} aria-current={p.day===i?'step':undefined} onClick={()=>selectDay(i)}>{p.completed.includes(i)?'✓ ':''}Day {l.n}</button>)}</div>
 <section className="card"><p className="chip">One new lesson: {lesson.title}</p><h1>Day {lesson.n}: {lesson.title}</h1><Coach>{lesson.idea}</Coach><p><b>Your challenge:</b> {lesson.goal}</p>
 {p.day>0&&<details className="fold"><summary>Remember the earlier lesson</summary><p>{lesson.recall}</p></details>}
 <p className="small">{p.stage==='first'?'First attempt: see what the current instruction does.':p.stage==='retry'?'Your revision: same guest, changed instruction.':'Fresh customer: test whether your instruction travels.'} No timer, hidden objective or forced closure.</p>
 {lesson.example&&<details className="fold"><summary>{p.day===3?'Evidence exercise: inspect this prepared answer':'Prepared contrast if you need one'}</summary><p>{lesson.example.before}</p><p>{lesson.example.after}</p><p>{lesson.example.why}</p></details>}
 {p.day===3&&<div className="lesson-source"><p><b>Prepared answer:</b> "We open at 7am."</p><p><b>Source:</b> "Open 8am to 5pm Monday to Saturday."</p><p>This is a labelled teaching example, not a live AI result. The claim conflicts with the source. Now check a real reply below.</p></div>}
 {p.day===1&&<div className="lesson-source"><h2>Notice for this guest</h2><p>{NOTICE[p.stage==='fresh'?1:0]}</p><p>The AI’s lesson facts deliberately omit opening hours. This notice is on your side until you supply it. Other days still include the café facts automatically.</p><label><input type="checkbox" checked={p.noticeAdded} onChange={e=>patch({noticeAdded:e.target.checked})}/> I added the relevant notice in my own instruction.</label></div>}
 <details className="fold"><summary>Facts and café plumbing</summary><ul>{FACTS.filter(f=>!f.startsWith('Staff discount')&&(p.day!==1||!f.startsWith('Open '))).map(f=><li key={f}>{f}</li>)}</ul><p>The game adds readable order/booking syntax. You do not have to learn it. Orders and bookings here are fictional. On Day 3 and Day 7 the game also blocks action until the missing choice or approval arrives.</p></details>
 <label className="lab" htmlFor="lesson-instructions">Your instructions to the AI</label><textarea id="lesson-instructions" rows={5} maxLength={2400} value={p.instructions} disabled={busy} onChange={e=>patch({instructions:e.target.value})}/><p className={'count '+(!safeText?'bad':'')}>{wordCount(p.instructions)} / 90 words</p>
 {p.stage==='retry'&&<p className="small">{changed?'You changed the instruction.':'Change the instruction yourself before retrying. Nothing is rewritten for you.'}</p>}
 {p.day===4&&p.stage==='retry'&&<><label className="lab" htmlFor="prediction">Predict what your one edit should change</label><textarea id="prediction" rows={2} maxLength={600} value={p.prediction} onChange={e=>patch({prediction:e.target.value})}/></>}
 <button className="btn ghost" onClick={()=>setHint(!hint)}>{hint?'Hide hint':'Ask Biscuit for a hint'}</button>{hint&&<Coach>{lesson.hint}</Coach>}
 <div className="lesson-guest"><span className="small">{lessonCustomer(p.day,p.stage).who}</span><p>{lessonCustomer(p.day,p.stage).line}</p></div>
 <button className="btn" disabled={startDisabled} onClick={()=>run(false)}>{busy?'Waiting for the free AI...':current?'Try this step again':p.stage==='first'?'Try the current instructions':p.stage==='retry'?'Retry the same guest':'Try the fresh customer'}</button>
 {error&&<p className="bad" role="alert">{error}</p>}
 {current&&<div className="lesson-result" aria-live="polite"><Playback key={dayAttempts.length} attempt={current}/><p className="small">{isTest?'Labelled stand-in reply, not a model.':'Actual free-model reply. A single reply does not prove your edit caused it.'}</p><blockquote>{parseReply(current.reply).spoken||'(No spoken reply)'}</blockquote><p><b>AI requested:</b> {describeAction(current.reply)}</p><p><b>Café did:</b> {awaitsGate?'Held the action. No order or booking can commit before the missing choice or approval.':describeAction(current.reply)}</p><p className={assessment?.kind==='gap'?'bad':'chip'}>{assessment?.kind==='met'?'Checked goal met: ':assessment?.kind==='human'?'Needs a human look, unscored: ':'Try one change: '}{assessment?.text}</p>
 {awaitsGate&&<section className="lesson-gate"><h2>{p.day===2?'Customer answers the question':'Approval gate'}</h2><p>{p.day===2?'The customer chooses a cappuccino. Send their answer only after a useful clarification.':'No booking has been made. If the AI asked you to approve this exact booking, you may approve now. If it tried to book without asking, revise and retry instead.'}</p><button className="btn" disabled={busy||assessment?.kind!=='met'||current.instructions!==p.instructions} onClick={()=>{patch({approval:p.day===6});run(true)}}>{p.day===2?'Customer: a cappuccino, please':'Approve this exact booking'}</button></section>}
 {previous&&p.stage!=='first'&&<details className="fold"><summary>Compare with the first attempt</summary><p><b>Before:</b> {previous.instructions}</p><p>{parseReply(previous.reply).spoken}</p><p><b>Now:</b> {current.instructions}</p><p>{parseReply(current.reply).spoken}</p><p>Compare visible behavior. Model variation means this is not proof of cause.</p></details>}
 <label className="lab" htmlFor="reflection">{p.day===3?'Which exact source supports or contradicts the answer?':'What happened, and what should your instruction change or preserve?'}</label><textarea id="reflection" maxLength={800} rows={2} value={p.reflection} onChange={e=>patch({reflection:e.target.value})}/>
 <label className="lesson-check"><input type="checkbox" checked={p.checked} onChange={e=>patch({checked:e.target.checked})}/> I compared the reply, the visible goal and what the café actually did.{assessment?.kind==='human'?' I reviewed the uncertain wording myself; this is not a code-awarded pass.':''}</label>
 {p.stage==='first'?<button className="btn" disabled={busy||!understands||!p.checked} onClick={revise}>Write my improvement</button>:p.stage==='retry'?<button className="btn" disabled={busy||!canContinue||!changed} onClick={fresh}>Test a fresh customer</button>:<><label className="lab" htmlFor="transfer">{lesson.transfer}</label><textarea id="transfer" rows={3} maxLength={800} value={p.transfer} onChange={e=>patch({transfer:e.target.value})}/><button className="btn" disabled={busy||!canContinue||p.transfer.trim().split(/\s+/).length<6} onClick={()=>patch({completed:[...new Set([...p.completed,p.day])]})}>Record this lesson as practised</button><p className="small">This is your reflection, not an AI-graded exam or a guarantee of mastery.</p></>}
 </div>}
 {p.completed.includes(p.day)&&<section className="lesson-finish"><h2>Day {lesson.n} practised</h2><p>You tried it, revised it, checked a fresh request and applied it outside the café. You can repeat any lesson.</p>{p.day<6?<button className="btn" onClick={()=>selectDay(p.day+1)}>Continue to Day {p.day+2}</button>:<><h2>Seven habits to take with you</h2><ul>{LESSONS.map(l=><li key={l.n}>{l.title}</li>)}</ul><p>Practised does not mean mastered or secure. Try these habits on new tasks, check the results, and return when you need practice.</p><button className="btn" onClick={onMixed}>Optional mixed shift</button></>}</section>}
 </section>
 <section className="card"><button className="btn ghost" disabled={busy} onClick={onMixed}>Optional mixed shift (old café)</button><button className="btn ghost" disabled={busy} onClick={()=>setReset(true)}>Reset lesson progress</button>{reset&&<><p>Clear all seven-day instructions, attempts and progress on this browser? This cannot be undone. Mixed-shift saves are separate.</p><button className="btn" onClick={()=>{setP(base());setReset(false)}}>Reset all seven lessons</button><button className="btn ghost" onClick={()=>setReset(false)}>Keep my progress</button></>}</section>
 </main>
}
