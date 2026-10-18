import {ApiError,bodyJson,checkOrigin,failure,getMembers,ok,requireMember} from '@/lib/server';
import {emptyMealState,ensureDailyRice,mealDate,type MealCommand,type MealGroup} from '@/lib/meals';
import {changeMealGroup,maintainMealRice} from '@/lib/meals-server';
export const dynamic='force-dynamic';
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v);
export async function GET(){
 try{
  const {db,member}=await requireMember();
  const {data,error}=await db.from('meal_groups').select('*').eq('household_id',member.household_id).contains('member_ids',[member.id]).order('created_at');if(error)throw error;
  const groups=[];for(const g of data||[])groups.push(await maintainMealRice(db,g));
  return ok({groups,today:mealDate()});
 }catch(e){return failure(e);}
}
export async function POST(request:Request){
 try{
  checkOrigin(request);const {db,member}=await requireMember(),body=await bodyJson(request);
  if(!uuid(body.request_id))throw new ApiError('Invalid request identifier.');
  if(body.action==='create'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>60)throw new ApiError('Enter a group name of up to 60 characters.');
   const members=await getMembers(db,member.household_id);
   const ids=body.members;
   if(!Array.isArray(ids)||ids.length<2||ids.length>12||new Set(ids).size!==ids.length||!ids.includes(member.id)||!ids.every(id=>members.some(m=>m.id===id)))throw new ApiError('Choose 2–12 housemates, including yourself.');
   const {data:already,error:readError}=await db.from('meal_groups').select('*').eq('id',body.request_id).eq('household_id',member.household_id).contains('member_ids',[member.id]).maybeSingle();if(readError)throw readError;if(already)return ok(already);
   const {count,error:countError}=await db.from('meal_groups').select('id',{head:true,count:'exact'}).eq('household_id',member.household_id);if(countError)throw countError;if((count||0)>=20)throw new ApiError('This property already has 20 meal groups.');
   const now=new Date();
   const group=ensureDailyRice({id:body.request_id,household_id:member.household_id!,name:body.name.trim(),member_ids:ids,created_by:member.id,created_at:now.toISOString(),version:0,state:emptyMealState()} satisfies MealGroup,now);
   const {data,error}=await db.from('meal_groups').insert(group).select('*').single();if(error)throw new ApiError(error.code==='23505'?'That group name is already in use.':error.message);return ok(data);
  }
  if(!uuid(body.group_id))throw new ApiError('Choose a meal group.');
  return ok(await changeMealGroup(db,body.group_id,member.household_id!,member.id,body as MealCommand));
 }catch(e){return failure(e);}
}
