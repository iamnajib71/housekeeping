import { ApiError,bodyJson,checkOrigin,failure,getAssignment,ok,requireMember } from '@/lib/server';
export const maxDuration=60;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  checkOrigin(request);const {db,member}=await requireMember();const a=await getAssignment(db,(await params).id);
  if(!a.member_ids.includes(member.id))throw new ApiError('You can only upload proof for your assigned clean.',403);
  if(Number(request.headers.get('content-length')||0)>1.1*1024*1024)throw new ApiError('Upload one compressed photo at a time.',413);
  const form=await request.formData(),file=form.get('photo');
  if(!(file instanceof File)||file.type!=='image/jpeg'||file.size>1048576||file.size<4)throw new ApiError('Choose a JPEG photo under 1 MB.');
  const bytes=Buffer.from(await file.arrayBuffer());
  if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new ApiError('This file is not a valid JPEG photo.');
  const {data:photo,error:reserveError}=await db.rpc('reserve_photo',{p_assignment:a.id,p_member:member.id});if(reserveError)throw new ApiError(reserveError.message);
  const {error:uploadError}=await db.storage.from('cleaning-proof').upload(photo.path,bytes,{contentType:'image/jpeg',upsert:false,cacheControl:'60'});
  if(uploadError){const {error}=await db.storage.from('cleaning-proof').remove([photo.path]);if(!error)await db.from('photos').update({deleted_at:new Date().toISOString()}).eq('id',photo.id);throw uploadError;}
  const {error}=await db.from('photos').update({uploaded:true}).eq('id',photo.id);if(error)throw error;
  return ok({id:photo.id});
 }catch(e){return failure(e);}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  checkOrigin(request);const {db,member}=await requireMember();const a=await getAssignment(db,(await params).id);const {photoId}=await bodyJson(request);
  const {data:photo,error:retireError}=await db.rpc('retire_photo',{p_assignment:a.id,p_member:member.id,p_photo:photoId});if(retireError)throw new ApiError(retireError.message);
  const {error:removeError}=await db.storage.from('cleaning-proof').remove([photo.path]);if(removeError)throw removeError;
  const {error}=await db.from('photos').update({deleted_at:new Date().toISOString()}).eq('id',photo.id);if(error)throw error;
  return ok({ok:true});
 }catch(e){return failure(e);}
}
