import { ApiError,bodyJson,checkOrigin,failure,getAssignment,maySeeProof,ok,requireMember } from '@/lib/server';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {db,member}=await requireMember();const a=await getAssignment(db,(await params).id);
  if(!maySeeProof(member,a))return ok({submissions:[],photos:[]});
  const {data:submissions,error}=await db.from('submissions').select('*').eq('assignment_id',a.id);if(error)throw error;
  if(!submissions?.length)return ok({submissions:[],photos:[]});
  const {data:photos,error:photoError}=await db.from('photos').select('*').in('submission_id',submissions.map(s=>s.id));if(photoError)throw photoError;
  const signed=await Promise.all((photos||[]).map(async p=>{
   if(p.deleted_at||!p.uploaded)return p;
   const seconds=Math.min(300,Math.floor((new Date(p.expires_at).getTime()-Date.now())/1000));
   if(seconds<1)return {...p,deleted_at:p.expires_at};
   const {data,error}=await db.storage.from('cleaning-proof').createSignedUrl(p.path,seconds);if(error)throw error;
   return {...p,url:data.signedUrl};
  }));
  return ok({submissions,photos:signed});
 }catch(e){return failure(e);}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  checkOrigin(request);const {db,member}=await requireMember();const a=await getAssignment(db,(await params).id);const body=await bodyJson(request);
  if(!a.member_ids.includes(member.id))throw new ApiError('You can only submit your own assigned clean.',403);
  if(!Array.isArray(body.tasks)||(body.action!=='draft'&&!body.tasks.length)||body.tasks.length>30||!body.tasks.every((t:unknown)=>typeof t==='string'&&a.tasks.includes(t)))throw new ApiError('Choose at least one valid completed task.');
  if(typeof body.notes!=='string'||body.notes.length>2000)throw new ApiError('Notes must be 2,000 characters or less.');
  const {data,error}=await db.rpc(body.action==='draft'?'save_draft':'submit_clean',{p_assignment:a.id,p_member:member.id,p_tasks:[...new Set(body.tasks)],p_notes:body.notes.trim()});if(error)throw new ApiError(error.message);
  return ok(data);
 }catch(e){return failure(e);}
}
