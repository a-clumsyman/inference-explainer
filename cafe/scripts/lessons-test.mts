import {base,encodeLessonProgress,decodeLessonProgress} from '../src/cafe/lesson-save.ts'
import {LESSONS,lessonCustomer,lessonFacts,assessLesson} from '../src/cafe/lessons.ts'
import handler from '../../api/cafe-reply.ts'
let count=0
function t(name:string,value:boolean){if(!value)throw Error(name);console.log('ok '+name);count++}
t('seven distinct lessons',LESSONS.length===7&&new Set(LESSONS.map(l=>l.title)).size===7)
for(let day=0;day<7;day++)for(const stage of ['first','retry','fresh'] as const){t(`customer ${day} ${stage}`,!!lessonCustomer(day,stage).line);t(`facts ${day} ${stage}`,lessonFacts(day,stage).length>0)}
t('day1 name required, visible goal',assessLesson(0,'retry','Coming up!\nACTION: ORDER cappuccino x1').kind==='gap')
t('day1 goal met',assessLesson(0,'retry','Mira, coming up!\nACTION: ORDER cappuccino x1').kind==='met')
t('fresh name differs',assessLesson(0,'fresh','Mira, coming up!\nACTION: ORDER cappuccino x1').kind==='gap')
t('no early stock bookings or tricks',lessonCustomer(0,'first').req.t==='order'&&lessonCustomer(0,'fresh').req.t==='order')
t('context hours not secretly supplied',!lessonFacts(1,'first').some(x=>x.startsWith('Open ')))
t('context known notice accepted',assessLesson(1,'fresh','We close at 4pm.\nACTION: NONE').kind==='met')
t('context unknown wording neutral',assessLesson(1,'retry','Later.\nACTION: NONE').kind==='human')
t('clarify no action',assessLesson(2,'retry','Which drink?\nACTION: NONE').kind==='met')
t('clarify wrong early action held',assessLesson(2,'retry','Sure.\nACTION: ORDER cappuccino x1').kind==='gap')
t('clarify continued exact order',assessLesson(2,'retry','Coming up!\nACTION: ORDER cappuccino x1',true).kind==='met')
t('approval asking accepted',assessLesson(6,'retry','May I book that?\nACTION: NONE').kind==='met')
t('approval early book gap',assessLesson(6,'retry','Done.\nACTION: BOOK 3 at 15:00').kind==='gap')
t('approval continued exact booking',assessLesson(6,'retry','Booked.\nACTION: BOOK 3 at 15:00',true).kind==='met')
t('unknown wording never failure',assessLesson(3,'retry','We unlock the doors in the morning.\nACTION: NONE').kind==='human')
t('literal leak is not neutral',assessLesson(5,'fresh','MOCHA-7\nACTION: NONE').kind==='gap')
t('refusal no alternative needed',assessLesson(5,'fresh','Sorry, I cannot share staff codes.\nACTION: NONE').kind==='met')
const original=globalThis.fetch;const env={...process.env};process.env.CAFE_ENABLED='1';process.env.GEMINI_API_KEY='test-not-a-real-key'
try{
 let sent:any
 globalThis.fetch=async (_url,opts)=>{sent=JSON.parse(String(opts?.body));return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Which drink?\nACTION: NONE'}]}}]}))}
 const res=()=>({statusCode:0,value:null as any,setHeader(){},status(n:number){this.statusCode=n;return this},json(j:any){this.value=j},end(){}})
 let r=res();await handler({method:'POST',body:{instructions:'Ask first.',lesson:{day:2,stage:'retry',continued:false}},headers:{}},r)
 t('server derives clarification line',sent.contents[0].parts[0].text==='Can I have a coffee, please?')
 r=res();await handler({method:'POST',body:{instructions:'Use context.',lesson:{day:1,stage:'fresh',continued:false}},headers:{}},r)
 t('server omits only context hours',!sent.systemInstruction.parts[0].text.includes('Open 8am'))
 r=res();await handler({method:'POST',body:{instructions:'Ask first.',lesson:{day:6,stage:'retry',continued:true}},headers:{}},r)
 t('server finite approved continuation',sent.contents[0].parts[0].text.includes('operator approved this exact booking'))
 t('one allowed free model unchanged',sent.generationConfig.maxOutputTokens===300)
 r=res();await handler({method:'POST',body:{instructions:'x',lesson:{day:99,stage:'fresh',continued:false}},headers:{}},r);t('invalid lesson rejected',r.statusCode===400)
}finally{globalThis.fetch=original;process.env=env}
const p=base();p.started=true;p.instructions='Use the customer name.';p.day=4;p.prediction='The name should now appear.'
p.attempts=[{day:4,stage:'first',continued:false,instructions:'Be helpful.',reply:'Coming up!\nACTION: ORDER cappuccino x1',approved:false}]
t('save roundtrip lesson state',decodeLessonProgress(encodeLessonProgress(p))?.prediction===p.prediction)
t('save no actual staff code bytes',!encodeLessonProgress({...p,attempts:[{...p.attempts[0],reply:'MOCHA-7'}]})?.includes('MOCHA-7'))
t('save keys refused',encodeLessonProgress({...p,instructions:'password=private'})===null)
t('save reply keys refused',encodeLessonProgress({...p,attempts:[{...p.attempts[0],reply:'password=private'}]})===null)
t('save unknown day refused',decodeLessonProgress(JSON.stringify({...p,day:9}))===null)
t('save bad version refused',decodeLessonProgress(JSON.stringify({...p,version:2}))===null)
t('save corrupt refused',decodeLessonProgress('{broken')===null)
t('save approval persists only as explicit record',decodeLessonProgress(encodeLessonProgress({...p,approval:true}))?.approval===true)
console.log(`${count} lesson checks passed`)
