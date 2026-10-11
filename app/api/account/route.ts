import { cookies } from 'next/headers';
import { randomBytes,createHash } from 'node:crypto';
import { ApiError,bodyJson,checkOrigin,failure,ok,requireUser,requireMember,userMemberships } from '@/lib/server';
import { accountName,inviteEmail,signupMode,validInviteToken } from '@/lib/accounts';
export const dynamic='force-dynamic';
async function selectHome(id:number){(await cookies()).set('household',String(id),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:31536000});}
export async function GET(){
 try{
  const {db,user}=await requireUser(),members=await userMemberships(db,user);
  const {data,error}=await db.from('households').select('id,name,address').in('id',members.map(m=>m.household_id));if(error)throw error;
  return ok({email:user.email,name:user.user_metadata?.full_name||'',homes:(data||[]).map(h=>({...h,role:members.find(m=>m.household_id===h.id)?.role}))});
 }catch(e){return failure(e);}
}
export async function POST(request:Request){
 try{
  checkOrigin(request);const body=await bodyJson(request),{db,user}=await requireUser();
  if(body.action==='create'){
   let name,address,memberName,mode;
   try{name=accountName(body.name,80);address=accountName(body.address,240);memberName=accountName(body.memberName);mode=signupMode(body.mode);}catch(e){throw new ApiError((e as Error).message);}
   if(address.length<5)throw new ApiError('Enter the full property address.');
   const {data,error}=await db.rpc('create_household',{p_user:user.id,p_email:user.email,p_name:name,p_address:address,p_member_name:memberName,p_participates:mode==='admin_tenant'});
   if(error)throw new ApiError(error.message);await selectHome(data);return ok({id:data});
  }
  if(body.action==='accept'){
   if(!validInviteToken(body.token))throw new ApiError('Invalid invitation.');
   const {data,error}=await db.rpc('accept_tenant_invitation',{p_user:user.id,p_email:user.email,p_hash:createHash('sha256').update(body.token).digest('hex')});if(error)throw new ApiError(error.message);
   await selectHome(data);return ok({id:data});
  }
  if(body.action==='select'){
   const memberships=await userMemberships(db,user);if(!memberships.some(m=>m.household_id===body.id))throw new ApiError('This property is not on your account.',403);
   await selectHome(body.id);return ok({ok:true});
  }
  if(body.action==='guide'){
   const {member}=await requireMember();const {error}=await db.from('members').update({guide_completed:true}).eq('id',member.id);if(error)throw error;return ok({ok:true});
  }
  if(body.action==='invite'){
   const {member}=await requireMember(true);let email,name;
   try{email=inviteEmail(body.email);name=accountName(body.name);}catch(e){throw new ApiError((e as Error).message);}
   const {count,error:countError}=await db.from('tenant_invitations').select('id',{count:'exact',head:true}).eq('household_id',member.household_id).gt('created_at',new Date(Date.now()-86400000).toISOString());if(countError)throw countError;
   if((count||0)>=50)throw new ApiError('Invitation limit reached for today.',429);
   const token=randomBytes(32).toString('hex');
   const {data,error}=await db.from('tenant_invitations').insert({household_id:member.household_id,email,name,token_hash:createHash('sha256').update(token).digest('hex'),created_by:member.id}).select('id,expires_at').single();if(error)throw error;
   return ok({...data,url:new URL('/invite?token='+token,process.env.APP_URL||request.url).toString()});
  }
  if(body.action==='revoke'){
   const {member}=await requireMember(true);const {error}=await db.from('tenant_invitations').update({revoked_at:new Date().toISOString()}).eq('id',body.id).eq('household_id',member.household_id).is('accepted_at',null);if(error)throw error;return ok({ok:true});
  }
  throw new ApiError('Unknown account action.');
 }catch(e){return failure(e);}
}
