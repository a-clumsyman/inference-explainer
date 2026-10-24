import {MENU,type Customer} from './data.ts'
export const CHOICE_MARKER='\n--- CUSTOMER CHOICE ---\n'
export function conversationReady(c:Customer,spoken:string,actionType:string):boolean{
 if(actionType!=='none'||(!c.clarify&&c.req.t!=='order'))return false
 if(c.clarify&&!c.approval)return /\?|which|what (?:drink|kind|type)|prefer/i.test(spoken)
 if(c.req.t!=='order')return false
 const total=Math.round(c.req.items.reduce((n,i)=>n+MENU[i.name]*i.qty,0)*100)/100
 const prices=[...spoken.matchAll(/\$?\s*(\d+(?:[.,]\d{1,2})?)\b/g)].map(m=>Number(m[1].replace(',','.')))
 const question=/\?|\b(?:confirm|approve|is that (?:ok|okay)|shall I|may I|would you like|can I|do you (?:agree|accept|want))\b/i.test(spoken)
 return prices.some(n=>Math.abs(n-total)<0.005)&&question
}

export function customerAnswer(c:Customer):string{return c.clarify??'Yes, that total is fine. Please prepare my order.'}
