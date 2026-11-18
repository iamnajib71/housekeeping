import 'server-only';
import {ApiError,database,getMembers,getSettings} from './server';
import {generateSchedule,addDays,localClock} from './schedule';
import {validCalendarDate} from './availability';

export async function setMemberAvailability(db:ReturnType<typeof database>,household:number,id:string,change:{from?:unknown;back?:unknown}) {
 const today=localClock().date;
 const [members,settings]=await Promise.all([getMembers(db,household),getSettings(db,household)]);
 const target=members.find(m=>m.id===id);
 if(!target||target.participates===false)throw new ApiError('Choose a participating tenant from this home.');
 let from:string|null,until:string|null=null;
 if(change.back===true){
  if(!target.away_from||(target.away_until&&target.away_until<=today))throw new ApiError('This tenant is already available.');
  from=target.away_from>today?null:target.away_from;
  until=from?today:null;
  if(from===today){from=null;until=null;}
 }else{
  if(!validCalendarDate(change.from)||change.from<today||change.from>addDays(today,365))throw new ApiError('Choose an away date from today through the next year.');
  if(target.away_from&&target.away_from<=today&&(!target.away_until||target.away_until>today))throw new ApiError('Mark this tenant back before recording another absence.');
  from=change.from;
 }
 const effective=change.back===true?today:from!;
 const {data:latest,error}=await db.from('assignments').select('date').eq('household_id',household).order('date',{ascending:false}).limit(1);if(error)throw error;
 const end=[addDays(today,90),latest?.[0]?.date||effective,effective].sort().at(-1)!;
 if(end>addDays(today,365))throw new ApiError('This roster extends beyond a year. Contact the app administrator.');
 const next=members.map(m=>m.id===id?{...m,away_from:from,away_until:until}:m);
 const pool=members.map(m=>({id:m.id,position:m.position,participates:m.participates!==false,away_from:m.away_from||null,away_until:m.away_until||null})).sort((a,b)=>a.id.localeCompare(b.id));
 const rows=generateSchedule(next,settings,effective,end).map(a=>({...a,household_id:household}));
 const {data,error:writeError}=await db.rpc('set_member_absence',{p_household:household,p_member:id,p_from:from,p_until:until,p_effective:effective,p_pool:pool,p_rows:rows});
 if(writeError)throw new ApiError(writeError.message,409);
 return data;
}
