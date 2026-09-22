import {createClient} from '@supabase/supabase-js';
import {generateSchedule,addDays,localClock} from '../lib/schedule';
async function main() {
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
const {data:members,error}=await db.from('members').select('*').order('position');if(error)throw error;
const {data:settings,error:se}=await db.from('household_settings').select('*').eq('id',1).single();if(se)throw se;
const rows=generateSchedule(members!,settings,settings.daily_start,addDays(settings.daily_start,110));
const {error:saveError}=await db.from('assignments').upsert(rows,{onConflict:'id',ignoreDuplicates:true});if(saveError)throw saveError;
const authSettings=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!}}).then(r=>r.json());
console.log(JSON.stringify({members:members!.length,assignments:rows.length,googleLoginEnabled:authSettings.external?.google,allEmailsSet:members!.every(m=>Boolean(m.email))}));

}
main().catch(e => { console.error(e.message); process.exitCode = 1; });