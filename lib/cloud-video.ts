import { OnboardingError } from './onboarding';
export const VIDEO_CHUNK_BYTES=2*1024*1024;
export const MAX_VIDEO_BYTES=250*1024*1024;
export const VIDEO_TYPES=['video/mp4','video/webm','video/quicktime','video/3gpp','video/x-matroska','video/x-msvideo','video/mpeg','video/x-flv'];
const base='https://generativelanguage.googleapis.com';
export type GoogleVideoFile={name:string;uri:string;state:'PROCESSING'|'ACTIVE'|'FAILED';videoMetadata?:{videoDuration?:string};mimeType?:string};
export function providerUploadUrl(value:string){
  const url=new URL(value);if(url.origin!==base||!url.pathname.startsWith('/upload/'))throw new OnboardingError('Unexpected video upload destination.');return url.href;
}
function filePath(name:string){if(!/^files\/[a-zA-Z0-9_-]+$/.test(name))throw new OnboardingError('Invalid temporary video reference.');return name;}
export async function beginVideoUpload(key:string,size:number,type:string,id:string){
  const response=await fetch(base+'/upload/v1beta/files',{method:'POST',headers:{'x-goog-api-key':key,'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(size),'X-Goog-Upload-Header-Content-Type':type,'Content-Type':'application/json'},body:JSON.stringify({file:{display_name:'Housekeeping trial '+id}}),signal:AbortSignal.timeout(15000)});
  const url=response.headers.get('x-goog-upload-url');if(!response.ok||!url)throw new OnboardingError('Google could not start this upload. Check your Gemini key and available free quota.');return providerUploadUrl(url);
}
export async function sendVideoChunk(url:string,bytes:Uint8Array,offset:number,final:boolean){
  const response=await fetch(providerUploadUrl(url),{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Goog-Upload-Offset':String(offset),'X-Goog-Upload-Command':final?'upload, finalize':'upload'},body:bytes as BodyInit,signal:AbortSignal.timeout(40000)});
  if(!response.ok)throw new OnboardingError('The cloud upload was interrupted. Retry this chunk.');
  if(!final)return null;
  const result=await response.json();if(!result.file?.name||!result.file?.uri)throw new OnboardingError('Google did not return the uploaded video reference.');filePath(result.file.name);return result.file as GoogleVideoFile;
}
export async function queryVideoUpload(url:string){
  const response=await fetch(providerUploadUrl(url),{method:'POST',headers:{'X-Goog-Upload-Command':'query'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new OnboardingError('The upload session is unavailable. Choose the video and start again.');
  const received=Number(response.headers.get('x-goog-upload-size-received')||0);
  if(!Number.isSafeInteger(received)||received<0)throw new OnboardingError('Invalid cloud upload state.');return received;
}
export async function getVideoFile(key:string,name:string):Promise<GoogleVideoFile>{
  const response=await fetch(base+'/v1beta/'+filePath(name),{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new OnboardingError('The temporary video is no longer available. Upload it again.');return response.json();
}
export async function deleteVideoFile(key:string,name:string){
  const response=await fetch(base+'/v1beta/'+filePath(name),{method:'DELETE',headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(15000)});
  if(!response.ok&&response.status!==404)throw new OnboardingError('Temporary video cleanup will be retried.');
}
