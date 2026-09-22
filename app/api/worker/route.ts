import { ApiError,bodyJson,database,failure,ok,requireWorker } from '@/lib/server';
import { pollEmails } from '@/lib/worker';
export const maxDuration=60;
export async function POST(request:Request){
 let authorized=false;
 try{
  requireWorker(request);authorized=true;const body=await bodyJson(request);
  if(body.action==='poll'){
   const limit=Number.isInteger(body.limit)?Math.min(10,Math.max(0,body.limit)):10;
   return ok(await pollEmails(limit));
  }
  if(body.action==='ack'){
   if(typeof body.id!=='string'||typeof body.leaseToken!=='string')throw new ApiError('Invalid acknowledgement.');
   const db=database();
   const {data,error}=await db.from('email_jobs').update({status:'sent',sent_at:new Date().toISOString()}).eq('id',body.id).eq('lease_token',body.leaseToken).in('status',['leased','sent']).select('id');
   if(error)throw error;if(!data?.length)throw new ApiError('The delivery lease no longer matches.',409);
   return ok({ok:true});
  }
  if(body.action==='error'){
   const message=typeof body.message==='string'?body.message.slice(0,300):'Email delivery failed.';
   const {error}=await database().from('worker_health').update({last_error:message}).eq('id',1);if(error)throw error;return ok({ok:true});
  }
  throw new ApiError('Unknown worker action.');
 }catch(e){
  if(authorized){try{await database().from('worker_health').update({last_error:'A reminder or cleanup run failed. Check the script execution log.'}).eq('id',1);}catch{}}
  return failure(e);
 }
}
