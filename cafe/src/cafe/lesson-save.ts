import { LESSONS, type LessonStage } from './lessons.ts'
import { leaked } from './check.ts'
export type Attempt={day:number;stage:LessonStage;continued:boolean;instructions:string;reply:string;approved:boolean}
export type Progress={version:1;day:number;stage:LessonStage;instructions:string;firstInstructions:string;attempts:Attempt[];reflection:string;prediction:string;transfer:string;completed:number[];checked:boolean;approval:boolean;choice:string;noticeAdded:boolean;started:boolean}
export const base=():Progress=>({version:1,day:0,stage:'first',instructions:LESSONS[0].initial,firstInstructions:'',attempts:[],reflection:'',prediction:'',transfer:'',completed:[],checked:false,approval:false,choice:'',noticeAdded:false,started:false})
const secretLike=(s:string)=>leaked(s)||/(?:AIza[\w-]{20,}|sk-[\w-]{16,}|\b(?:password|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+)/i.test(s)
export function decodeLessonProgress(raw:string|null):Progress|null{
 try{if(!raw||raw.length>250000)return null;const p=JSON.parse(raw)
 if(p.version!==1||!Number.isInteger(p.day)||!LESSONS[p.day]||!['first','retry','fresh'].includes(p.stage)||!Array.isArray(p.attempts)||p.attempts.length>60||!Array.isArray(p.completed)||p.completed.some((n:unknown)=>!Number.isInteger(n)||Number(n)<0||Number(n)>6))return null
 for(const k of ['instructions','firstInstructions','reflection','prediction','transfer','choice'])if(typeof p[k]!=='string'||p[k].length>2400||secretLike(p[k]))return null
 if(p.attempts.some((a:Attempt)=>!LESSONS[a.day]||!['first','retry','fresh'].includes(a.stage)||typeof a.reply!=='string'||a.reply.length>4000||typeof a.instructions!=='string'||a.instructions.length>2400||secretLike(a.instructions)||typeof a.continued!=='boolean'||typeof a.approved!=='boolean'))return null
 for(const k of ['checked','approval','noticeAdded','started'])if(typeof p[k]!=='boolean')return null
 return p
 }catch{return null}
}
export function encodeLessonProgress(p:Progress):string|null{
 // Save game-only text. Remove the fictional code bytes but preserve its disclosure
 // as a visible marker. No API key, facts-sheet copy or account data is persisted.
 if([p.instructions,p.firstInstructions,p.reflection,p.prediction,p.transfer,p.choice,...p.attempts.map(a=>a.instructions)].some(secretLike)||p.attempts.some(a=>/(?:AIza[\w-]{20,}|sk-[\w-]{16,}|\b(?:password|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+)/i.test(a.reply)))return null
 return JSON.stringify({...p,attempts:p.attempts.slice(-60).map(a=>({...a,reply:a.reply.replace(/m\W*o\W*c\W*h\W*a\W*[-_ ]?\W*7/gi,'[fictional staff code disclosed]')}))})
}
