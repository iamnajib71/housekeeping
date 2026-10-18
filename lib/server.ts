import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies,headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import type { Assignment, Member, Settings } from './types';
import { addDays, generateSchedule, localClock } from './schedule';
import { canSubmitInWindow, submissionWindow } from './submission-window';
export class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function database() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key) throw new ApiError('The household database is not connected yet.',503);
 return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
export async function sessionClient() {
 const jar=await cookies(),url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key) throw new ApiError('Login is not connected yet.',503);
 return createServerClient(url,key,{cookies:{getAll:()=>jar.getAll(),setAll:values=>{values.forEach(({name,value,options})=>jar.set(name,value,options));}}});
}
export async function requireUser() {
 const auth=await sessionClient();const {data:{user},error}=await auth.auth.getUser();
 if(error||!user?.email||!user.email_confirmed_at) throw new ApiError('Please sign in with Google.',401);
 return {db:database(),user};
}
export async function userMemberships(db:ReturnType<typeof database>,user:{id:string;email?:string}) {
 const {data,error}=await db.from('members').select('*').eq('email',user.email!.toLowerCase()).order('household_id');
 if(error)throw error;
 return (data||[]).filter(m=>!m.user_id||m.user_id===user.id) as Member[];
}
export async function requireMember(admin=false) {
 const {db,user}=await requireUser(),members=await userMemberships(db,user);
 const requested=(await headers()).get('x-household-id');
 const selected=Number(requested||(await cookies()).get('household')?.value);
 if(requested&&!members.some(m=>m.household_id===selected))throw new ApiError('This property is not on your account.',403);
 const member=members.find(m=>m.household_id===selected)||members[0];
 if(!member)throw new ApiError('Create a home or accept your tenant invitation to get started.',403);
 if(admin&&member.role!=='admin') throw new ApiError('Only the household admin can do this.',403);
 return {db,member,user};
}
export function checkOrigin(request:Request) {
 const origin=request.headers.get('origin'),expected=new URL(process.env.APP_URL||request.url).origin;
 if(!origin||origin!==expected) throw new ApiError('This request must come from the household app.',403);
}
export function requireWorker(request:Request) {
 const expected=process.env.WORKER_SECRET,given=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!expected||expected.length<32||!given||Buffer.byteLength(given)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(expected),Buffer.from(given))) throw new ApiError('Unauthorized worker.',401);
 if(process.env.VERCEL_ENV && process.env.VERCEL_ENV!=='production') throw new ApiError('Reminders are disabled in preview deployments.',403);
}
export async function bodyJson(request:Request) {
 if(Number(request.headers.get('content-length')||0)>20000) throw new ApiError('Request is too large.',413);
 const text=await request.text();if(text.length>20000) throw new ApiError('Request is too large.',413);
 try{return JSON.parse(text);}catch{throw new ApiError('Invalid request.');}
}
export async function getSettings(db=database(),household=1):Promise<Settings>{const {data,error}=await db.from('household_settings').select('*').eq('id',household).single();if(error)throw error;return data;}
export async function getMembers(db=database(),household=1):Promise<Member[]>{const {data,error}=await db.from('members').select('*').eq('household_id',household).order('position');if(error)throw error;return data;}
export async function ensureSchedule(db=database(),settings?:Settings,members?:Member[]) {
 settings ||= await getSettings(db);members ||= await getMembers(db);
 if(!settings.daily_tasks.length||!settings.weekly_tasks.length||!members.some(m=>m.participates!==false))return;
 const today=localClock().date,end=addDays(today<settings.daily_start?settings.daily_start:today,90);
 const start=today>settings.daily_start?today:settings.daily_start;if(start>end)return;
 const rows=generateSchedule(members,settings,start,end);
 for(let i=0;i<rows.length;i+=250){const {error}=await db.from('assignments').upsert(rows.slice(i,i+250),{onConflict:'id',ignoreDuplicates:true});if(error)throw error;}
}
export async function getAssignment(db:ReturnType<typeof database>,id:string,household=1):Promise<Assignment>{
 if(!/^(?:\d+-)?(daily|weekly)-\d{4}-\d{2}-\d{2}$/.test(id))throw new ApiError('Assignment not found.',404);
 const {data,error}=await db.from('assignments').select('*').eq('id',id).eq('household_id',household).maybeSingle();if(error)throw error;if(!data)throw new ApiError('Assignment not found.',404);return data;
}
export async function requireOpenSubmission(db:ReturnType<typeof database>,assignment:Assignment,member:string) {
 const {data,error}=await db.from('submissions').select('status').eq('assignment_id',assignment.id).eq('member_id',member).maybeSingle();
 if(error)throw error;
 const window=submissionWindow(assignment.date,data?.status);
 if(canSubmitInWindow(window))return;
 if(window==='future')throw new ApiError('Uploads and submission open on the cleaning date.');
 if(window==='submitted')throw new ApiError('This submission is locked.');
 throw new ApiError('The late submission window closed at noon the following day (Melbourne time). Ask your admin to record a late entry.',409);
}
export function ok(value:unknown){return NextResponse.json(value,{headers:{'Cache-Control':'private, no-store'}});}
export function failure(error:unknown){
 if(error instanceof ApiError)return NextResponse.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
 console.error('Housekeeping request failed:',error instanceof Error?error.message:'Database operation failed');
 return NextResponse.json({error:'We could not save or load this information. Please try again.'},{status:500,headers:{'Cache-Control':'no-store'}});
}
