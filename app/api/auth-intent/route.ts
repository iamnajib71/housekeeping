import {cookies} from 'next/headers';
import {bodyJson,checkOrigin,failure,ok,ApiError} from '@/lib/server';
import {validInviteToken} from '@/lib/accounts';
export async function POST(request:Request){try{
 checkOrigin(request);const body=await bodyJson(request);
 if(body.mode&&!['admin','admin_tenant'].includes(body.mode))throw new ApiError('Invalid signup choice.');
 if(body.invite&&!validInviteToken(body.invite))throw new ApiError('Invalid invitation.');
 (await cookies()).set('auth-intent',JSON.stringify({mode:body.mode||null,invite:body.invite||null}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:1800});return ok({ok:true});
}catch(e){return failure(e);}}
