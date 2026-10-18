import 'server-only';
import { ApiError, database } from './server';
import { applyMealCommand,ensureDailyRice,type MealCommand,type MealGroup } from './meals';

export async function maintainMealRice(db:ReturnType<typeof database>,g:MealGroup,now=new Date()):Promise<MealGroup>{
 for(let attempt=0;attempt<3;attempt++){
  const next=ensureDailyRice(g,now);
  if(JSON.stringify(next.state)===JSON.stringify(g.state))return g;
  const {data,error}=await db.from('meal_groups').update({state:next.state,version:g.version+1}).eq('id',g.id).eq('version',g.version).select('*').maybeSingle();
  if(error)throw error;if(data)return data;
  const {data:current,error:ce}=await db.from('meal_groups').select('*').eq('id',g.id).single();if(ce)throw ce;g=current;
 }
 throw new ApiError('The meal group changed. Refresh and try again.',409);
}
export async function changeMealGroup(db:ReturnType<typeof database>,group:string,home:number,actor:string,c:MealCommand,now=new Date()):Promise<MealGroup>{
 for(let attempt=0;attempt<3;attempt++){
  const {data:g,error}=await db.from('meal_groups').select('*').eq('id',group).eq('household_id',home).contains('member_ids',[actor]).maybeSingle();
  if(error)throw error;if(!g)throw new ApiError('Meal group not found.',404);
  let next:MealGroup;try{next=applyMealCommand(g,actor,c,now);}catch(e){throw new ApiError((e as Error).message);}
  if(next===g)return g;
  const {data,error:writeError}=await db.from('meal_groups').update({state:next.state,version:g.version+1}).eq('id',group).eq('household_id',home).contains('member_ids',[actor]).eq('version',g.version).select('*').maybeSingle();
  if(writeError)throw writeError;if(data)return data;
 }
 throw new ApiError('Someone updated this group. Refresh and try again.',409);
}
