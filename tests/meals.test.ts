import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyMealCommand,emptyMealState,ensureDailyRice,mealInstant,mealCount,mealReminders,suggestMealRoles,type MealGroup,type MealCommand} from '../lib/meals';
const now=new Date('2026-10-18T03:00:00Z');
function group(ids=['a','b','c']):MealGroup{return {id:randomUUID(),household_id:1,name:'Dinner',member_ids:ids,created_by:ids[0],created_at:now.toISOString(),version:0,state:emptyMealState()};}
function act(g:MealGroup,action:string,body:Record<string,unknown>={},at=now,actor='a'){return applyMealCommand(g,actor,{action,request_id:randomUUID(),...body} as MealCommand,at);}
function plan(g:MealGroup,at=now){return act(g,'plan',{participants:g.member_ids,dishes:['Curry','Dal'],when:new Date(at.getTime()+3600000).toISOString(),days:3},at);}

test('Melbourne rice times handle summer, winter and daily generation without duplicates',()=>{
 assert.equal(mealInstant('2026-10-18','18:30'),'2026-10-18T07:30:00.000Z');
 assert.equal(mealInstant('2026-07-18','18:30'),'2026-07-18T08:30:00.000Z');
 let g=group();const owners=[];
 for(let day=18;day<=23;day++){
  const at=new Date(`2026-10-${day}T03:00Z`);g=ensureDailyRice(g,at);const r=g.state.rice.at(-1)!;owners.push(r.owner);
  assert.equal(ensureDailyRice(g,at).state.rice.length,day-17);
  g=act(g,'rice_done',{rice_id:r.id},at);
 }
 for(const id of g.member_ids)assert.equal(owners.filter(owner=>owner===id).length,2);
 assert.equal(new Set(owners.slice(0,3)).size,3);
 assert.equal(group().state.rice.length,0);
});
test('joint grocery credit influences automatic team selection without trapping a non-shopper',()=>{
 const g=act(group(),'trip',{members:['b','c'],on:'2026-10-18'});
 assert.equal(mealCount(g,'b','grocery'),1);assert.equal(mealCount(g,'c','grocery'),1);assert.equal(mealCount(g,'a','grocery'),0);
 assert.equal(suggestMealRoles(g).cook,'a');
 assert.equal(new Set(Object.values(suggestMealRoles(g))).size,3);
 assert.equal(g.state.events.length,1);
});
test('three completed batches rotate main cooking and prep, preserving history and suggested next cook',()=>{
 let g=group();const cooks=[],preps=[];
 for(let turn=0;turn<3;turn++){
  g=plan(g);const next=g.state.batches.find(b=>b.status==='planned')!;cooks.push(next.roles.cook);preps.push(next.roles.prep);
  g=act(g,'ready',{batch_id:next.id});
  assert.equal(g.state.batches.filter(b=>b.status==='planned').length,1);
  assert.equal(g.state.batches.at(-1)!.confirmed,false);
 }
 assert.equal(new Set(cooks).size,3);assert.equal(new Set(preps).size,3);
 for(const id of g.member_ids){assert.equal(mealCount(g,id,'cook'),1);assert.equal(mealCount(g,id,'prep'),1);}
 assert.equal(g.state.batches.filter(b=>b.status==='ready').length,3);
 assert.equal(g.state.events.filter(e=>e.kind==='grocery').length,0);
});
test('rice absence reassigns pending work but does not rewrite completed work',()=>{
 let g=ensureDailyRice(group(),now);const r=g.state.rice[0];
 g=act(g,'away',{away:true},now,r.owner);assert.notEqual(g.state.rice[0].owner,r.owner);
 const owner=g.state.rice[0].owner;g=act(g,'rice_done',{rice_id:r.id});g=act(g,'away',{away:true},now,owner);
 assert.equal(g.state.rice[0].owner,owner);assert.equal(mealCount(g,owner,'rice'),1);
 let all=ensureDailyRice(group(),now);for(const id of all.member_ids)all=act(all,'away',{away:true},now,id);
 assert.equal(all.state.rice.length,0);
});
test('request identifiers prevent duplicate credit and ready cannot be counted twice',()=>{
 let g=plan(group());const id=g.state.batches[0].id;
 const c={action:'ready',request_id:randomUUID(),batch_id:id};g=applyMealCommand(g,'a',c,now);
 assert.deepEqual(applyMealCommand(g,'a',c,now),g);
 assert.throws(()=>act(g,'ready',{batch_id:id}));
 const trip={action:'trip',request_id:randomUUID(),members:['b','c'],on:'2026-10-18'};g=applyMealCommand(g,'a',trip,now);
 assert.equal(applyMealCommand(g,'a',trip,now).state.events.filter(e=>e.kind==='grocery').length,1);
});
test('food running low brings only an unconfirmed suggestion forward',()=>{
 let g=plan(group());g=act(g,'ready',{batch_id:g.state.batches[0].id});
 const current=g.state.batches.find(b=>b.status==='ready')!;
 g=act(g,'food',{batch_id:current.id,food:'low'});
 assert.equal(g.state.batches.at(-1)!.when,mealInstant('2026-10-19','19:00'));
 g=plan(g);const confirmed=g.state.batches.at(-1)!.when;
 g=act(g,'food',{batch_id:current.id,food:'finished'});assert.equal(g.state.batches.at(-1)!.when,confirmed);
});
test('shopping list updates do not fabricate trips; invalid inputs and outsiders are rejected',()=>{
 let g=act(group(),'item',{text:'Chicken 1 kg',urgency:'next'});g=act(g,'item_status',{item_id:g.state.items[0].id,status:'bought'});
 assert.equal(g.state.events.length,0);
 assert.throws(()=>act(g,'trip',{members:['outsider'],on:'2026-10-18'}));
 assert.throws(()=>act(g,'trip',{members:['a','a'],on:'2026-10-18'}));
 assert.throws(()=>act(g,'trip',{members:['a'],on:'2026-10-19'}));
 assert.throws(()=>act(g,'trip',{members:['a'],on:'2026-02-31'}));
 assert.throws(()=>act(g,'item',{text:'x'.repeat(121),urgency:'next'}));
 assert.throws(()=>act(g,'item',{text:'Milk',urgency:'bad'}));
 assert.throws(()=>act(g,'away',{away:true},now,'outsider'));
 assert.throws(()=>act(g,'plan',{participants:['a','b'],dishes:['x'],when:now.toISOString(),days:3,cook:'a',prep:'a'}));
});
test('two-person groups still get distinct cooks and preparers, with a shared grocery role',()=>{
 const g=plan(group(['a','b']));const b=g.state.batches[0];assert.notEqual(b.roles.cook,b.roles.prep);
 assert.ok(g.member_ids.includes(b.roles.shopper!));
});
test('larger groups distribute cooking turns across all available people',()=>{
 for(const count of [4,6,12]){
  let g=group(Array.from({length:count},(_,i)=>'person-'+i));
  const actor=g.member_ids[0];
  for(let turn=0;turn<count;turn++){
   g=act(g,'plan',{participants:g.member_ids,dishes:['Dinner'],when:new Date(now.getTime()+3600000).toISOString(),days:3},now,actor);
   const next=g.state.batches.find(b=>b.status==='planned')!;
   assert.equal(new Set(Object.values(next.roles)).size,3);
   g=act(g,'ready',{batch_id:next.id},now,actor);
  }
  for(const id of g.member_ids)assert.equal(mealCount(g,id,'cook'),1);
 }
});
test('reminders target current owners, suppress completed work, and observe quiet hours',()=>{
 const evening=new Date('2026-10-18T07:15Z');let g=ensureDailyRice(group(),evening),r=g.state.rice[0];
 assert.deepEqual(mealReminders(g,evening).filter(n=>n.title.includes('rice')).map(n=>n.member_id),[r.owner]);
 assert.throws(()=>act(g,'rice_help',{rice_id:r.id,take:true},evening,'b'));
 g=act(g,'rice_help',{rice_id:r.id},evening,r.owner);g=act(g,'rice_help',{rice_id:r.id,take:true},evening,'b');
 assert.ok(!mealReminders(g,evening).some(n=>n.member_id==='a'&&n.title.includes('Time to start rice')));
 g=act(g,'rice_done',{rice_id:r.id},evening);assert.equal(mealReminders(g,evening).length,0);
 assert.equal(mealReminders(ensureDailyRice(group(),now),new Date('2026-10-18T12:00Z')).length,0);
 const disabled=ensureDailyRice(group(),evening);disabled.state.reminders=false;assert.equal(mealReminders(disabled,evening).length,0);
});
test('missing groceries prompt only the assigned shopper; bought or have suppresses it',()=>{
 let g=plan(group(),new Date('2026-10-18T06:00Z'));
 g=act(g,'item',{text:'Rice',urgency:'next'});const b=g.state.batches[0],at=new Date('2026-10-18T06:30Z');
 const shopping=mealReminders(g,at).filter(n=>n.title.includes('Ingredients still needed'));
 assert.equal(shopping.length,1);assert.equal(shopping[0].member_id,b.roles.shopper);
 g=act(g,'item_status',{item_id:g.state.items[0].id,status:'have'});
 assert.ok(!mealReminders(g,at).some(n=>n.title.includes('Ingredients still needed')));
});
test('no groceries today preserves the list and previous joint credit, and does not disable future shopping',()=>{
 let g=act(group(),'trip',{members:['b','c'],on:'2026-10-18'});
 g=act(g,'item',{text:'Milk for later',urgency:'soon'});
 const before=structuredClone(g.state.events);
 g=act(g,'groceries_needed',{needed:false});
 assert.deepEqual(g.state.events,before);
 assert.equal(g.state.items[0].status,'needed');
 g=plan(g);
 assert.equal(g.state.batches[0].roles.shopper,null);
 const late=new Date('2026-10-18T04:30Z');
 assert.ok(!mealReminders(g,late).some(n=>n.title.includes('Ingredients still needed')));
 assert.equal(mealCount(g,'b','grocery'),1);assert.equal(mealCount(g,'c','grocery'),1);
 g=act(g,'ready',{batch_id:g.state.batches[0].id});
 assert.ok(g.state.batches.at(-1)!.roles.shopper);
 assert.notEqual(suggestMealRoles(g,g.member_ids,true).shopper,null);
});
test('None is accepted in cooking plans and does not require a third active duty',()=>{
 const g=act(group(),'plan',{participants:['a','b','c'],dishes:['Curry'],when:mealInstant('2026-10-18','19:00'),days:3,cook:'a',prep:'b',shopper:null});
 assert.equal(g.state.batches[0].roles.shopper,null);
 assert.notEqual(g.state.batches[0].roles.cook,g.state.batches[0].roles.prep);
 assert.throws(()=>act(group(),'plan',{participants:['a','b','c'],dishes:['Curry'],when:mealInstant('2026-10-18','19:00'),days:3,cook:'a',prep:'a',shopper:null}));
});
test('skipping a planned grocery duty cancels help/reminders; enabling it restores a valid shopper without giving credit',()=>{
 let g=plan(group(),new Date('2026-10-18T06:00Z'));
 g=act(g,'item',{text:'Chicken',urgency:'next'});
 const b=g.state.batches[0],rice=structuredClone(g.state.rice),roles=structuredClone(b.roles),at=new Date('2026-10-18T06:30Z');
 g=act(g,'help',{batch_id:b.id,role:'shopper'},now,b.roles.shopper!);
 g=act(g,'groceries_needed',{batch_id:b.id,needed:false});
 assert.equal(g.state.batches[0].roles.shopper,null);
 assert.ok(!g.state.batches[0].help.includes('shopper'));
 assert.ok(!mealReminders(g,at).some(n=>n.title.includes('Ingredients still needed')||n.body.startsWith('Groceries needs')));
 assert.throws(()=>act(g,'help',{batch_id:b.id,role:'shopper'}));
 assert.deepEqual(g.state.rice,rice);
 assert.equal(g.state.batches[0].roles.cook,roles.cook);assert.equal(g.state.batches[0].roles.prep,roles.prep);
 g=act(g,'groceries_needed',{batch_id:b.id,needed:true});
 assert.ok(g.state.batches[0].roles.shopper);
 assert.ok(mealReminders(g,at).some(n=>n.title.includes('Ingredients still needed')));
 assert.equal(g.state.events.length,0);
});


test('cooking reminders target cook and prep, follow role swaps and stop after batch ready',()=>{
 const at=new Date('2026-10-18T06:00Z');let g=plan(group(),at);
 const b=g.state.batches[0],soon=new Date(at.getTime()+30*60000);
 const notices=mealReminders(g,soon).filter(n=>n.title.includes('soon'));
 assert.deepEqual(new Set(notices.map(n=>n.member_id)),new Set([b.roles.cook,b.roles.prep]));
 assert.equal(notices.length,2);
 g=act(g,'plan',{participants:g.member_ids,dishes:b.dishes,when:b.when,days:3,cook:'c',prep:'b',shopper:null},soon);
 assert.deepEqual(new Set(mealReminders(g,soon).filter(n=>n.title.includes('soon')).map(n=>n.member_id)),new Set(['c','b']));
 g=act(g,'ready',{batch_id:b.id},soon);
 assert.ok(!mealReminders(g,soon).some(n=>n.title.includes('soon')||n.title.includes('not marked ready')));
});
