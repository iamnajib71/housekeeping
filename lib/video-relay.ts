import type { SupabaseClient } from '@supabase/supabase-js';
import { OnboardingError } from './onboarding';
import { queryVideoUpload, sendVideoChunk, VIDEO_CHUNK_BYTES } from './cloud-video';

export const WALKTHROUGH_BUCKET='walkthrough-buffer';
export const PROVIDER_CHUNK_BYTES=8*1024*1024;
type Upload={id:string;upload_url:string;upload_size:number};

// Vercel receives 2 MB; Google's Files API requires 8 MB non-final chunks.
// Private temporary objects bridge those limits without keeping a complete video.
export async function relayVideoChunk(db:SupabaseClient,trial:Upload,chunk:Uint8Array,offset:number){
  const store=db.storage.from(WALKTHROUGH_BUCKET);
  const path=`${trial.id}/${offset}`;
  const {error}=await store.upload(path,chunk,{contentType:'application/octet-stream',upsert:true});
  if(error)throw new OnboardingError('Temporary cloud storage is unavailable. Check free storage space and retry.');
  const end=offset+chunk.length,final=end===Number(trial.upload_size);
  if(!final&&end%PROVIDER_CHUNK_BYTES!==0)return {file:null,paths:[] as string[]};
  const start=Math.floor(offset/PROVIDER_CHUNK_BYTES)*PROVIDER_CHUNK_BYTES;
  const paths:string[]=[];for(let p=start;p<end;p+=VIDEO_CHUNK_BYTES)paths.push(`${trial.id}/${p}`);
  const received=await queryVideoUpload(trial.upload_url);
  if(received!==start&&received!==end)throw new OnboardingError('Cloud upload offset changed. Choose the video and start again.');
  if(received===end&&final)throw new OnboardingError('The final upload acknowledgement was lost. Choose the video and start again.');
  if(received===end)return {file:null,paths};
  const pieces=await Promise.all(paths.map(async name=>{const {data,error}=await store.download(name);if(error||!data)throw new OnboardingError('A temporary upload chunk is missing. Choose the video again.');return new Uint8Array(await data.arrayBuffer());}));
  if(pieces.reduce((n,p)=>n+p.length,0)!==end-start)throw new OnboardingError('Temporary upload size mismatch. Choose the video again.');
  const combined=new Uint8Array(end-start);let position=0;for(const piece of pieces){combined.set(piece,position);position+=piece.length;}
  const file=await sendVideoChunk(trial.upload_url,combined,start,final);
  return {file,paths};
}

export async function clearVideoBuffer(db:SupabaseClient,id:string){
  const store=db.storage.from(WALKTHROUGH_BUCKET);const {data,error}=await store.list(id,{limit:100});
  if(error)throw error;if(data?.length){const {error}=await store.remove(data.map(file=>`${id}/${file.name}`));if(error)throw error;}
}
