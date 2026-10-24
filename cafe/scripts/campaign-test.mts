import {readFileSync} from 'node:fs'
import handler from '../../api/cafe-reply.ts'
let count=0
function t(name:string,value:boolean){if(!value)throw Error(name);console.log('ok '+name);count++}
const appSource=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
t('original gameplay entry restored',appSource.includes('export default function App()')&&appSource.includes('async function playShift')&&!appSource.includes('Curriculum'))
t('restoration keeps neutral system checks',appSource.includes('No guests scored yet')&&appSource.includes('Nothing here was scored against your instructions.'))
t('restoration keeps browser save and review loop',appSource.includes('decodeProgress')&&appSource.includes('Review with Biscuit')&&appSource.includes('Resume the shift at customer'))

t('intro replay separate from saved screen',appSource.includes("useState(params.get('intro') === '1')")&&appSource.includes('Watching the intro does not reset your instructions or progress.')&&appSource.includes('Watch intro'))
console.log(`${count} lesson checks passed`)

const {levelWon,decodeCampaign,unlocked,matchesLevel}=await import('../src/cafe/campaign.ts')
const {POOL,pickShift,LEVELS}=await import('../src/cafe/data.ts')
const {check,shiftChecker}=await import('../src/cafe/check.ts')
const {simulate}=await import('../src/cafe/sim.ts')
const q=POOL.find(c=>c.id==='q1')!
const complete='Which drink?\nACTION: NONE\n--- CUSTOMER CHOICE ---\nHere is your cappuccino.\nACTION: ORDER cappuccino x1'
t('seven actual shift levels',LEVELS.length===7&&LEVELS[0].mix.order===4)
t('clarification action is held and scored gap',!check(q,'Done.\nACTION: ORDER cappuccino x1').ok&&!check(q,'Done.\nACTION: ORDER cappuccino x1').infra)
t('clarification alone unscored',check(q,'Which drink?\nACTION: NONE').infra)
t('clarification conversation exact order passes',check(q,complete).ok)
t('clarification cannot bypass failed first action',!check(q,complete.replace('Which drink?\nACTION: NONE','Done.\nACTION: ORDER latte x1')).ok)
t('held clarification cannot consume stock',check(q,'Done.\nACTION: ORDER croissant x2').stockAfter.croissant===2)
t('held clarification has no prep or booking events',!simulate([q],['Done.\nACTION: ORDER cappuccino x1']).events.some(e=>e.kind==='prep_done'||e.kind==='booking_confirmed'))
t('clarification choices appear in scene event order',simulate([q],[complete]).events.some(e=>e.text.includes('Customer answers: A cappuccino')))
t('campaign needs every planned guest',!levelWon([{v:check(q,complete)}],2)&&levelWon([{v:check(q,complete)}],1))
t('campaign unscored cannot silently unlock',!levelWon([{v:check(q,'Which?\nACTION: NONE')}],1))
t('campaign locked until predecessor clear',!unlocked(decodeCampaign(null),2)&&unlocked({version:1,cleared:[1],best:{}},2))
t('campaign corrupt save safe',decodeCampaign('{broken').cleared.length===0)
t('campaign unknown level safe',decodeCampaign('{"version":1,"cleared":[999],"best":{}}').cleared.length===0)
for(const lv of LEVELS){for(let i=0;i<20;i++){const sh=pickShift(lv);t('level '+lv.n+' full fair shift '+i,sh.length===Object.values(lv.mix).reduce((a,b)=>a+(b??0),0))}}
void shiftChecker


const a=POOL.find(c=>c.id==='a3')!
const approved='Total 7.20. May I prepare that?\nACTION: NONE\n--- CUSTOMER CHOICE ---\nComing up!\nACTION: ORDER cappuccino x1, croissant x1'
t('opening immediate ticket cannot pass',!check(a,'Coming up!\nACTION: ORDER cappuccino x1, croissant x1').ok)
t('opening early preparation held without stock mutation',check(a,'Coming up!\nACTION: ORDER cappuccino x1, croissant x1').stockAfter.croissant===2)
t('opening quote yes prepare passes',check(a,approved).ok)
t('quote before yes fulfils total instruction without repeating bill',check(a,approved,undefined,'State the combined total before asking for yes.').ok)
t('opening missing quote is unscored not invented failure',check(a,'May I prepare that?\nACTION: NONE').infra)
t('opening wrong quote cannot pass',!check(a,approved.replace('7.20','4.00')).ok)
t('opening wrong final item cannot pass',!check(a,approved.replace('croissant x1','croissant x2')).ok)
t('old same-count run cannot clear new opening',!matchesLevel({planned:4,rows:POOL.filter(c=>['r9','r10','r20','o6'].includes(c.id)).map(c=>({c}))},LEVELS[0]))
t('new opening matches only its actual queue',matchesLevel({planned:4,rows:pickShift(LEVELS[0]).map(c=>({c}))},LEVELS[0]))
const original=globalThis.fetch;const env={...process.env};process.env.CAFE_ENABLED='1';process.env.GEMINI_API_KEY='test-not-a-real-key'
try{
 let sent:any
 globalThis.fetch=async (_url,opts)=>{sent=JSON.parse(String(opts?.body));return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Total 4.50. May I prepare that?\nACTION: NONE'}]}}]}))}
 const res=()=>({statusCode:0,value:null as any,setHeader(){},status(n:number){this.statusCode=n;return this},json(j:any){this.value=j},end(){}})
 let r=res();await handler({method:'POST',body:{instructions:'Be helpful.',customerId:'a1'},headers:{}},r)
 t('owner brief not secretly inserted into model prompt',!sent.systemInstruction.parts[0].text.includes('Owner brief')&&!sent.systemInstruction.parts[0].text.includes('customers must know the total'))
 r=res();await handler({method:'POST',body:{instructions:'Ask first.',customerId:'a1',continued:true,priorReply:'Total 4.50. May I prepare that?\nACTION: NONE'},headers:{}},r)
 t('server continuation retains actual request and quote',sent.contents.length===3&&sent.contents[0].parts[0].text==='Good morning. One latte to take away.'&&sent.contents[1].parts[0].text.includes('4.50')&&sent.contents[2].parts[0].text.startsWith('Yes'))
 r=res();await handler({method:'POST',body:{instructions:'x',lesson:{day:0,stage:'first',continued:false}},headers:{}},r);t('abandoned lesson API rejected',r.statusCode===400)
}finally{globalThis.fetch=original;process.env=env}
t('old opening proof not reused for new rule',decodeCampaign('{"version":1,"cleared":[0,1],"best":{"0":4,"1":5}}').cleared.join(',')==='1'&&decodeCampaign('{"version":1,"cleared":[0],"best":{"0":4}}').previousOpeningBest===4)
t('new opening proof survives reload',decodeCampaign('{"version":1,"openingRule":"quote-yes","cleared":[0],"best":{"0":4}}').cleared.includes(0))
const optional=POOL.find(c=>c.id==='r2')!
t('carried quote rule also supports customer yes in later levels',check(optional,approved.replace('7.20','8.00').replace('cappuccino x1, croissant x1','cappuccino x2'),undefined,'State total, wait for yes.').ok)
t('later levels still accept correct immediate service',check(optional,'Coming up!\nACTION: ORDER cappuccino x2').ok)
console.log(`${count} campaign checks passed`)
