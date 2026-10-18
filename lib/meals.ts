export type MealRole = 'cook'|'prep'|'shopper';
export type MealRoles = {cook:string;prep:string;shopper:string|null};
export const mealRoleNames:Record<MealRole,string>={cook:'Main cook',prep:'Prep & cleanup',shopper:'Groceries'};
export type MealBatch={id:string;dishes:string[];when:string;confirmed:boolean;status:'planned'|'ready'|'cancelled';roles:MealRoles;participants:string[];days:2|3;ready_at?:string;food:'enough'|'low'|'finished';checked_on?:string;help:MealRole[]};
export type MealItem={id:string;text:string;status:'needed'|'bought'|'have';urgency:'next'|'soon'|'later';updated_by:string};
export type MealEvent={id:string;kind:'cook'|'prep'|'grocery'|'rice';members:string[];on:string;recorded_at:string;actor:string;batch_id?:string;note?:string};
export type RiceDuty={id:string;date:string;owner:string;due:string;done_at?:string;help:boolean};
export type MealState={batches:MealBatch[];items:MealItem[];events:MealEvent[];rice:RiceDuty[];away:Record<string,string[]>;receipts:string[];rice_time:string;cook_time:string;reminders:boolean;no_groceries_on?:string};
export type MealGroup={id:string;household_id:number;name:string;member_ids:string[];created_by:string;created_at:string;version:number;state:MealState};
export type MealCommand={action:string;request_id:string;[key:string]:unknown};
const DAY=86400000;
export function mealDate(now=new Date()):string{return new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function mealAddDays(date:string,days:number){return new Date(Date.parse(date+'T12:00:00Z')+days*DAY).toISOString().slice(0,10);}
// Convert a Melbourne wall time, including DST, without using the host's zone.
export function mealInstant(date:string,time:string){
 const target=Date.parse(date+'T'+time+':00Z');let instant=target;
 for(let i=0;i<3;i++){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const get=(key:string)=>p.find(x=>x.type===key)!.value;
  const wall=Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);
  instant+=target-wall;
 }
 return new Date(instant).toISOString();
}
export function emptyMealState():MealState{return {batches:[],items:[],events:[],rice:[],away:{},receipts:[],rice_time:'18:30',cook_time:'19:00',reminders:true};}
export function mealCount(g:MealGroup,id:string,kind:MealEvent['kind']){return g.state.events.filter(e=>e.kind===kind&&e.members.includes(id)).length;}
function ranked(g:MealGroup,ids:string[],kind:MealEvent['kind'],turn=0){
 return [...ids].sort((a,b)=>{
  const last=(id:string)=>g.state.events.filter(e=>e.kind===kind&&e.members.includes(id)).at(-1)?.on||'';
  return mealCount(g,a,kind)-mealCount(g,b,kind)||last(a).localeCompare(last(b))||((g.member_ids.indexOf(a)-turn+g.member_ids.length)%g.member_ids.length)-((g.member_ids.indexOf(b)-turn+g.member_ids.length)%g.member_ids.length);
 });
}
export function suggestMealRoles(g:MealGroup,ids=g.member_ids,shoppingNeeded=true):MealRoles{
 if(ids.length<2)throw new Error('Choose at least two people for cooking.');
 const turn=g.state.batches.filter(b=>b.status==='ready').length;
 const load=(id:string)=>mealCount(g,id,'cook')*3+mealCount(g,id,'prep')*2+mealCount(g,id,'grocery');
 let best:MealRoles|undefined,bestScore=Infinity;
 // Evaluate the team together: picking a shopper first can trap the same two
 // people in cooking when no shopping is needed. Actual joint trips count too.
 for(const cook of ids)for(const prep of ids.filter(id=>id!==cook))for(const shopper of (shoppingNeeded?ids.filter(id=>ids.length===2||(id!==cook&&id!==prep)):[null])){
  const score=mealCount(g,cook,'cook')*20+mealCount(g,prep,'prep')*15+load(cook)*3+load(prep)*2+(shopper?mealCount(g,shopper,'grocery')+load(shopper):0);
  const distance=(id:string,slot:number)=>(g.member_ids.indexOf(id)-turn-slot+g.member_ids.length*10)%g.member_ids.length;
  const tie=distance(cook,0)*100+distance(prep,1)*10+(shopper?distance(shopper,2):0);
  const total=score*10000+tie;
  if(total<bestScore){bestScore=total;best={cook,prep,shopper};}
 }
 return best!;
}
export function mealShoppingNeeded(g:MealGroup,batch:MealBatch|undefined,today:string){
 return batch?batch.roles.shopper!==null&&!(g.state.no_groceries_on===today&&mealDate(new Date(batch.when))===today):g.state.no_groceries_on!==today;
}
export function ensureDailyRice(original:MealGroup,now=new Date()):MealGroup{
 const g=structuredClone(original),today=mealDate(now),available=g.member_ids.filter(id=>!g.state.away[today]?.includes(id));
 if(!available.length||g.state.rice.some(r=>r.date===today))return g;
 const last=g.state.rice.at(-1)?.owner;
 const turn=g.state.rice.length%g.member_ids.length;
 const owner=ranked(g,available,'rice',turn).sort((a,b)=>Number(a===last)-Number(b===last))[0];
 g.state.rice.push({id:'rice-'+today,date:today,owner,due:mealInstant(today,g.state.rice_time),help:false});
 return g;
}
function text(v:unknown,max=120){if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new Error(`Enter text of 1–${max} characters.`);return v.trim();}
function ids(v:unknown,allowed:string[],min=1){if(!Array.isArray(v)||v.length<min||v.length>12||!v.every(id=>typeof id==='string'&&allowed.includes(id))||new Set(v).size!==v.length)throw new Error('Choose valid group members.');return v as string[];}
function date(v:unknown,today:string){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T12:00Z'))||v>today||v<mealAddDays(today,-365)||new Date(v+'T12:00Z').toISOString().slice(0,10)!==v)throw new Error('Choose a valid past or current date.');return v;}
function when(v:unknown,now:Date){if(typeof v!=='string'||!Number.isFinite(Date.parse(v))||Date.parse(v)<now.getTime()-DAY||Date.parse(v)>now.getTime()+90*DAY)throw new Error('Choose a cooking time within the next 90 days.');return new Date(v).toISOString();}
function timing(v:unknown){if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw new Error('Choose a valid time.');return v;}
export function applyMealCommand(original:MealGroup,actor:string,c:MealCommand,now=new Date()):MealGroup{
 if(!original.member_ids.includes(actor))throw new Error('This meal group is not on your account.');
 if(!/^[0-9a-f-]{36}$/i.test(c.request_id))throw new Error('Invalid request identifier.');
 if(original.state.receipts.includes(c.request_id))return original;
 const g=ensureDailyRice(original,now),s=g.state,today=mealDate(now),at=now.toISOString();
 const batch=()=>{const b=s.batches.find(b=>b.id===c.batch_id);if(!b)throw new Error('Choose an existing batch.');return b;};
 const event=(kind:MealEvent['kind'],members:string[],on=today,batch_id?:string,note?:string)=>s.events.push({id:c.request_id+':'+kind,kind,members,on,recorded_at:at,actor,...(batch_id?{batch_id}:{}),...(note?{note}:{})});
 switch(c.action){
  case 'plan':{
   const participants=ids(c.participants,g.member_ids,2);
   if(!Array.isArray(c.dishes)||c.dishes.length<1||c.dishes.length>2)throw new Error('Enter one or two dishes.');
   const cookingTime=when(c.when,now);
   const shoppingNeeded=c.shopper!==null&&!(c.shopper===undefined&&s.no_groceries_on===mealDate(new Date(cookingTime)));
   const dishes=c.dishes.map(d=>text(d,80)),roles=suggestMealRoles(g,participants,shoppingNeeded);
   for(const role of ['cook','prep'] as const)if(c[role]!==undefined)roles[role]=ids([c[role]],participants)[0];
   if(c.shopper!==undefined&&c.shopper!==null)roles.shopper=ids([c.shopper],participants)[0];
   if(c.shopper&&s.no_groceries_on===mealDate(new Date(cookingTime)))delete s.no_groceries_on;
   if(roles.cook===roles.prep||(roles.shopper&&participants.length>=3&&new Set(Object.values(roles)).size!==3))throw new Error('Give each person a different role.');
   if(c.days!==2&&c.days!==3)throw new Error('Choose two or three days.');
   const existing=s.batches.find(b=>b.status==='planned');
   const b:MealBatch={id:existing?.id||c.request_id,dishes,when:cookingTime,confirmed:true,status:'planned',roles,participants,days:c.days,food:'enough',help:[]};
   if(existing)s.batches[s.batches.indexOf(existing)]=b;else s.batches.push(b);
   break;
  }
  case 'ready':{
   const b=batch();if(b.status!=='planned'||!b.confirmed||!b.dishes.length)throw new Error('Confirm the dishes and cooking plan first.');
   b.status='ready';b.ready_at=at;b.food='enough';b.checked_on=today;b.help=[];
   event('cook',[b.roles.cook],today,b.id);event('prep',[b.roles.prep],today,b.id);
   // A suggested next batch is visible immediately, but needs a time/dish confirmation.
   s.batches.push({id:c.request_id+':next',dishes:[],when:mealInstant(mealAddDays(today,b.days-1),s.cook_time),confirmed:false,status:'planned',roles:suggestMealRoles(g),participants:[...g.member_ids],days:b.days,food:'enough',help:[]});
   break;
  }
  case 'food':{
   const b=batch();if(b.status!=='ready'||!['enough','low','finished'].includes(String(c.food)))throw new Error('Choose the current food status.');
   b.food=c.food as MealBatch['food'];b.checked_on=today;
   const next=s.batches.find(b=>b.status==='planned');
   if(next&&!next.confirmed&&b.food!=='enough'){
    const proposed=mealInstant(b.food==='finished'?today:mealAddDays(today,1),s.cook_time);
    if(proposed<next.when)next.when=proposed;
   }
   break;
  }
  case 'item':
   if(s.items.filter(i=>i.status==='needed').length>=100)throw new Error('Finish some shopping items first.');
   if(!['next','soon','later'].includes(String(c.urgency)))throw new Error('Choose when the item is needed.');
   s.items.push({id:c.request_id,text:text(c.text),status:'needed',urgency:c.urgency as MealItem['urgency'],updated_by:actor});break;
  case 'item_status':{
   const item=s.items.find(i=>i.id===c.item_id);if(!item||!['needed','bought','have'].includes(String(c.status)))throw new Error('Choose a valid shopping item.');
   item.status=c.status as MealItem['status'];item.updated_by=actor;break;
  }
  case 'groceries_needed':{
   if(typeof c.needed!=='boolean')throw new Error('Choose whether a grocery trip is needed.');
   if(c.batch_id){
    const b=batch();if(b.status!=='planned')throw new Error('Only upcoming grocery duties can be changed.');
    b.roles.shopper=c.needed?(b.participants.filter(id=>id!==b.roles.cook&&id!==b.roles.prep)[0]||suggestMealRoles(g,b.participants).shopper):null;
    b.help=b.help.filter(role=>role!=='shopper');
    if(c.needed&&s.no_groceries_on===mealDate(new Date(b.when)))delete s.no_groceries_on;
   }else if(c.needed)delete s.no_groceries_on;else s.no_groceries_on=today;
   break;
  }
  case 'trip':event('grocery',ids(c.members,g.member_ids),date(c.on,today),undefined,typeof c.note==='string'?text(c.note,300):undefined);break;
  case 'rice_done':{
   const r=s.rice.find(r=>r.id===c.rice_id);if(!r||r.done_at)throw new Error('This rice duty is unavailable or already done.');
   r.done_at=at;r.help=false;event('rice',[r.owner],r.date);break;
  }
  case 'rice_help':{
   const r=s.rice.find(r=>r.id===c.rice_id);if(!r||r.done_at)throw new Error('This rice duty is already done.');
   if(c.take===true){if(!r.help)throw new Error('Ask the rice owner to request help first.');if(s.away[today]?.includes(actor))throw new Error('Mark yourself as joining meals first.');r.owner=actor;r.help=false;}else {if(r.owner!==actor)throw new Error('Only the rice owner can request help.');r.help=true;}break;
  }
  case 'help':{
   const b=batch(),role=c.role as MealRole;if(b.status!=='planned'||!['cook','prep','shopper'].includes(role)||!b.roles[role]||(role==='shopper'&&!mealShoppingNeeded(g,b,today)))throw new Error('Choose an active planned duty.');
   if(c.take===true){
    if(!b.help.includes(role))throw new Error('Ask the current owner to request a swap first.');
    if(Object.values(b.roles).includes(actor))throw new Error('You already have a duty. Agree new roles using Confirm cooking plan.');
    b.roles[role]=actor;b.help=b.help.filter(r=>r!==role);
   }else{if(b.roles[role]!==actor)throw new Error('Only the duty owner can request help.');if(!b.help.includes(role))b.help.push(role);}break;
  }
  case 'away':{
   const away=new Set(s.away[today]||[]);if(c.away===true)away.add(actor);else away.delete(actor);s.away[today]=[...away];
   const r=s.rice.find(r=>r.date===today&&!r.done_at);
   if(r&&away.has(r.owner)){
    const available=g.member_ids.filter(id=>!away.has(id));
    if(available.length){r.owner=ranked(g,available,'rice',s.rice.length)[0];r.help=false;}else s.rice=s.rice.filter(row=>row!==r);
   }
   break;
  }
  case 'settings':{
   s.rice_time=timing(c.rice_time);s.cook_time=timing(c.cook_time);
   if(typeof c.reminders!=='boolean')throw new Error('Invalid reminder setting.');s.reminders=c.reminders;
   const r=s.rice.find(r=>r.date===today&&!r.done_at);if(r)r.due=mealInstant(today,s.rice_time);break;
  }
  case 'cancel':{const b=batch();if(b.status!=='planned')throw new Error('Completed history cannot be cancelled.');b.status='cancelled';break;}
  default:throw new Error('Unknown meal action.');
 }
 s.receipts=[...s.receipts,c.request_id].slice(-100);
 if(JSON.stringify(s).length>750000)throw new Error('This group history needs archiving before adding more entries.');
 return g;
}
export type MealReminder={key:string;member_id:string;title:string;body:string};
export function mealReminders(g:MealGroup,now=new Date()):MealReminder[]{
 const today=mealDate(now),hour=Number(new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',hour:'2-digit',hourCycle:'h23'}).format(now));
 if(!g.state.reminders||hour<8||hour>=22)return [];
 const result:MealReminder[]=[],add=(key:string,ids:string[],title:string,body:string)=>{for(const id of ids)if(g.member_ids.includes(id))result.push({key:key+':'+id,member_id:id,title:g.name+': '+title,body});};
 const current=g.state.batches.filter(b=>b.status==='ready').at(-1),next=g.state.batches.find(b=>b.status==='planned');
 if(current&&!next&&current.checked_on!==today&&(current.food!=='enough'||today>=mealAddDays(mealDate(new Date(current.ready_at!)),current.days-1)))add('food:'+current.id+':'+today,g.member_ids,'Check the food','Enough food for tomorrow? Update Enough / Running low / Finished and plan the next cook.');
 if(current&&current.checked_on!==today&&today>=mealAddDays(mealDate(new Date(current.ready_at!)),current.days-1))add('food:'+current.id+':'+today,g.member_ids,'Check the food','Is there enough food left? Tap to check the batch and next cooking plan.');
 if(next){
  const remaining=Date.parse(next.when)-now.getTime();
  if(!next.confirmed&&remaining<=DAY&&remaining>-DAY)add('confirm:'+next.id,g.member_ids,'Confirm the next cook','Choose the dishes and confirm a time for the suggested cooking pair.');
  if(next.confirmed&&remaining<=3600000&&remaining>-DAY){
   const late=remaining<0;
   for(const role of ['cook','prep'] as const)add(`${next.id}:${next.when}:${role}:${late?'late':'soon'}`,[next.roles[role]],late?'Cooking still unconfirmed':mealRoleNames[role]+' soon',late?'The batch is not marked ready yet. Update it or request help.':'Your cooking session starts within an hour. Check ingredients and your partner.');
   if(remaining < -1800000)add(next.id+':support:'+next.when,g.member_ids,'Does the cooking pair need help?','The planned batch is still unconfirmed after its cooking time. Check in or update the plan.');
  }
  if(next.roles.shopper&&mealShoppingNeeded(g,next,today)&&next.confirmed&&remaining<=2*3600000&&remaining>-DAY&&g.state.items.some(i=>i.status==='needed'&&i.urgency!=='later'))add(next.id+':shopping:'+next.when,[next.roles.shopper],'Ingredients still needed','There are missing ingredients before the next cook. Update the shopping list or ask for help.');
  for(const role of next.help.filter(role=>role!=='shopper'||mealShoppingNeeded(g,next,today)))add(next.id+':help:'+role,g.member_ids.filter(id=>id!==next.roles[role]),'A meal duty needs help',mealRoleNames[role]+' needs a swap. Open the group to agree who can take over.');
 }
 const rice=g.state.rice.find(r=>r.date===today&&!r.done_at);
 if(rice){
  const remaining=Date.parse(rice.due)-now.getTime();
  if(remaining<=1800000)add(rice.id+':'+rice.owner+':'+(remaining<0?'late':'soon'),[rice.owner],remaining<0?'Rice still unconfirmed':'Time to start rice','You own today’s rice. Mark it done after cooking, or request help.');
  if(rice.help)add(rice.id+':help:'+rice.owner,g.member_ids.filter(id=>id!==rice.owner),'Rice duty needs help','Today’s rice owner has requested help. Tap to take over.');
 }
 // A food check may qualify through more than one condition.
 return [...new Map(result.map(r=>[r.key,r])).values()];
}
