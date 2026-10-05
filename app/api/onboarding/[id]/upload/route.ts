import { ApiError, checkOrigin, failure, ok, requireMember } from '@/lib/server';
import { OnboardingError } from '@/lib/onboarding';
import { VIDEO_CHUNK_BYTES } from '@/lib/cloud-video';
import { relayVideoChunk, WALKTHROUGH_BUCKET } from '@/lib/video-relay';
export const maxDuration=90;
export const runtime='nodejs';
async function bytes(request:Request){
  if(Number(request.headers.get('content-length')||0)>VIDEO_CHUNK_BYTES)throw new ApiError('Upload chunk is too large.',413);
  const reader=request.body?.getReader();if(!reader)throw new ApiError('Missing video chunk.');const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>VIDEO_CHUNK_BYTES){await reader.cancel();throw new ApiError('Upload chunk is too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  if(!size)throw new ApiError('Empty video chunk.');return Buffer.concat(chunks);
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    checkOrigin(request);const {db,member}=await requireMember(true);const id=(await params).id;
    if(!/^[0-9a-f-]{36}$/i.test(id))throw new ApiError('Invalid upload.');
    const rawOffset=request.headers.get('x-upload-offset');const offset=Number(rawOffset);
    if(rawOffset===null||!Number.isSafeInteger(offset)||offset<0)throw new ApiError('Invalid chunk offset.');
    const chunk=await bytes(request);
    const {data:existing,error:existingError}=await db.from('walkthrough_trials').select('upload_offset,status').eq('id',id).eq('member_id',member.id).maybeSingle();if(existingError)throw existingError;
    if(existing&&Number(existing.upload_offset)===offset+chunk.length)return ok({nextOffset:Number(existing.upload_offset),processing:existing.status==='processing'});
    const {data:trial,error}=await db.rpc('claim_walkthrough_upload',{p_trial:id,p_member:member.id,p_offset:offset});if(error)throw new ApiError(error.message,409);
    try{
      if(!trial.upload_url||offset+chunk.length>trial.upload_size)throw new ApiError('Chunk exceeds the video size.');
      const final=offset+chunk.length===Number(trial.upload_size);
      if(!final&&chunk.length!==VIDEO_CHUNK_BYTES)throw new ApiError('Use a complete chunk before the final chunk.');
      const {file,paths}=await relayVideoChunk(db,trial,chunk,offset);
      const {error:saveError}=await db.from('walkthrough_trials').update({upload_offset:offset+chunk.length,upload_token:null,upload_lease_until:null,...(file?{status:'processing',provider_file:file.name,upload_url:null}:{})}).eq('id',id).eq('upload_token',trial.upload_token);if(saveError)throw saveError;
      // Commit the offset first; maintenance retries any object cleanup failure.
      if(paths.length)await db.storage.from(WALKTHROUGH_BUCKET).remove(paths);
      return ok({nextOffset:offset+chunk.length,processing:Boolean(file)});
    }catch(e){await db.from('walkthrough_trials').update({upload_token:null,upload_lease_until:null}).eq('id',id).eq('upload_token',trial.upload_token);throw e;}
  }catch(e){return failure(e instanceof OnboardingError?new ApiError(e.message):e);}
}
