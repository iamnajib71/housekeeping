import { ApiError, checkOrigin, failure, ok, requireMember } from '@/lib/server';
import { OnboardingError, planChecklists, validateFrames, validatePlan } from '@/lib/onboarding';
import { detectCleaningPlan, detectVideoCleaningPlan } from '@/lib/onboarding-ai';
import { beginVideoUpload, deleteVideoFile, getVideoFile, MAX_VIDEO_BYTES, VIDEO_TYPES } from '@/lib/cloud-video';
import { mapAreasToPlan } from '@/lib/mapping';
export const maxDuration=90;
export const runtime='nodejs';

async function readBody(request: Request) {
  const limit=3_300_000;
  if(Number(request.headers.get('content-length')||0)>limit)throw new ApiError('Choose fewer snapshots; this request is too large.',413);
  const reader=request.body?.getReader();if(!reader)throw new ApiError('Missing request body.');
  const chunks:Uint8Array[]=[];let size=0;
  try { for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new ApiError('Choose fewer snapshots; this request is too large.',413);}chunks.push(value);} }
  finally { reader.releaseLock(); }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError('Invalid request.');}
}
export async function GET() {
  try {
    const {db,member}=await requireMember(true);
    const {data,error}=await db.from('walkthrough_trials').select('id,created_at,status,plan,frame_times,applied_at').eq('member_id',member.id).order('created_at',{ascending:false}).limit(5);
    if(error)throw error;
    return ok({configured:Boolean(process.env.GEMINI_API_KEY),trials:data||[]});
  } catch(e){return failure(e);}
}
export async function POST(request:Request) {
  try {
    checkOrigin(request);const {db,member}=await requireMember(true);const body=await readBody(request);
    if(body.action==='import_map'){
      // Geometry stays in the browser. Only bounded, admin-confirmed labels are saved.
      const plan=mapAreasToPlan(body.areas,body.duration);
      const {data:trial,error}=await db.rpc('begin_walkthrough',{p_member:member.id,p_times:[0]});
      if(error)throw new ApiError(error.message,429);
      const {data,error:saveError}=await db.from('walkthrough_trials').update({status:'ready',plan}).eq('id',trial.id).eq('member_id',member.id).select('id,created_at,status,plan,frame_times,applied_at').single();
      if(saveError)throw saveError;return ok(data);
    }
    if(body.action==='start_video'){
      const key=process.env.GEMINI_API_KEY;if(!key)throw new ApiError('The Gemini API key is not configured.',503);
      if(body.consent!==true)throw new ApiError('Confirm the video may be sent to Google for analysis.');
      if(!Number.isSafeInteger(body.size)||body.size<1||body.size>MAX_VIDEO_BYTES||!VIDEO_TYPES.includes(body.mimeType))throw new ApiError('Use a supported video smaller than 250 MB.');
      const {data:trial,error}=await db.rpc('begin_walkthrough',{p_member:member.id,p_times:[0]});if(error)throw new ApiError(error.message,429);
      try{
        const url=await beginVideoUpload(key,body.size,body.mimeType,trial.id);
        const {error:saveError}=await db.from('walkthrough_trials').update({status:'uploading',upload_url:url,upload_size:body.size,video_mime:body.mimeType}).eq('id',trial.id);if(saveError)throw saveError;
        return ok({id:trial.id,status:'uploading',created_at:trial.created_at,frame_times:[],plan:null,applied_at:null});
      }catch(e){await db.from('walkthrough_trials').update({status:'failed'}).eq('id',trial.id);throw e;}
    }
    if(body.action==='analyse_video'){
      const key=process.env.GEMINI_API_KEY;if(!key)throw new ApiError('The Gemini API key is not configured.',503);
      if(typeof body.id!=='string')throw new ApiError('Choose an uploaded walkthrough.');
      const {data:trial,error}=await db.from('walkthrough_trials').select('id,status,provider_file,video_mime').eq('id',body.id).eq('member_id',member.id).maybeSingle();if(error)throw error;
      if(!trial)throw new ApiError('Walkthrough unavailable.',404);
      if(trial.status==='analyzing')return ok({processing:true});
      if(trial.status==='ready'){
        const {data,error}=await db.from('walkthrough_trials').select('id,created_at,status,plan,frame_times,applied_at').eq('id',trial.id).single();if(error)throw error;return ok(data);
      }
      if(trial.status!=='processing'||!trial.provider_file)throw new ApiError('Upload the walkthrough again.');
      const file=await getVideoFile(key,trial.provider_file);
      if(file.state==='PROCESSING')return ok({processing:true});
      const {data:claimed,error:claimError}=await db.from('walkthrough_trials').update({status:'analyzing'}).eq('id',trial.id).eq('status','processing').select('id');if(claimError)throw claimError;if(!claimed?.length)return ok({processing:true});
      try{
        const duration=Number(file.videoMetadata?.videoDuration?.replace(/s$/,''));
        if(file.state!=='ACTIVE'||!Number.isFinite(duration)||duration<=0||duration>180)throw new ApiError('Google could not read this video, or it exceeds 3 minutes. Try a shorter recording.');
        const plan=await detectVideoCleaningPlan(file.uri,trial.video_mime,key,process.env.GEMINI_MODEL||'gemini-2.5-flash',duration);
        const {data,error}=await db.from('walkthrough_trials').update({status:'ready',plan}).eq('id',trial.id).select('id,created_at,status,plan,frame_times,applied_at').single();if(error)throw error;return ok(data);
      }catch(e){await db.from('walkthrough_trials').update({status:'failed'}).eq('id',trial.id);throw e;}
      finally{try{await deleteVideoFile(key,trial.provider_file);await db.from('walkthrough_trials').update({provider_file:null,upload_url:null}).eq('id',trial.id);}catch{/* Maintenance retries temporary-file deletion. */}}
    }
    if(body.action==='analyse'){
      const key=process.env.GEMINI_API_KEY;
      if(!key)throw new ApiError('Walkthrough analysis needs the admin’s Gemini API key. Your current cleaning setup is unchanged.',503);
      if(body.consent!==true)throw new ApiError('Confirm that the selected snapshots may be sent to Google for analysis.');
      const frames=validateFrames(body.frames);
      const {data:trial,error}=await db.rpc('begin_walkthrough',{p_member:member.id,p_times:frames.map(f=>f.seconds)});
      if(error)throw new ApiError(error.message,429);
      try {
        const plan=await detectCleaningPlan(frames,key,process.env.GEMINI_MODEL||'gemini-2.5-flash');
        const {data:saved,error:saveError}=await db.from('walkthrough_trials').update({status:'ready',plan}).eq('id',trial.id).eq('member_id',member.id).select('id,created_at,status,plan,frame_times,applied_at').single();
        if(saveError)throw saveError;return ok(saved);
      } catch(e){await db.from('walkthrough_trials').update({status:'failed'}).eq('id',trial.id);throw e;}
    }
    if(!['save','apply'].includes(body.action)||typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))throw new ApiError('Choose a saved walkthrough trial.');
    const {data:trial,error}=await db.from('walkthrough_trials').select('id,status,frame_times').eq('id',body.id).eq('member_id',member.id).maybeSingle();
    if(error)throw error;if(!trial||trial.status!=='ready')throw new ApiError('This walkthrough draft is unavailable.',404);
    const plan=validatePlan(body.plan,trial.frame_times.length);
    if(body.action==='apply'){
      const checklists=planChecklists(plan);
      const {data:changed,error}=await db.rpc('apply_walkthrough',{p_trial:trial.id,p_member:member.id,p_plan:plan,p_daily:checklists.daily,p_weekly:checklists.weekly,p_areas:checklists.areas});
      if(error)throw error;return ok({ok:true,changed});
    }
    const {error:saveError}=await db.from('walkthrough_trials').update({plan}).eq('id',trial.id).eq('member_id',member.id);if(saveError)throw saveError;
    return ok({ok:true});
  } catch(e){return failure(e instanceof OnboardingError?new ApiError(e.message):e);}
}
