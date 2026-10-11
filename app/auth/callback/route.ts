import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireUser,userMemberships, sessionClient } from '@/lib/server';
import { validInviteToken } from '@/lib/accounts';
export async function GET(request:Request){
 const url=new URL(request.url),origin=process.env.VERCEL?url.origin:new URL(process.env.APP_URL||url.origin).origin;
 try{
  const code=url.searchParams.get('code');if(!code)throw new Error('Google login was cancelled. Please try again.');
  const client=await sessionClient();const {error}=await client.auth.exchangeCodeForSession(code);if(error)throw error;
  const {db,user}=await requireUser(),members=await userMemberships(db,user);
  const jar=await cookies();let intent:{invite?:string;mode?:string}={};
  try{intent=JSON.parse(jar.get('auth-intent')?.value||'{}');}catch{}
  jar.delete('auth-intent');
  const invite=intent.invite,mode=intent.mode;
  if(validInviteToken(invite))return NextResponse.redirect(origin+'/welcome?invite='+invite);
  if(mode==='admin'||mode==='admin_tenant')return NextResponse.redirect(origin+'/welcome?mode='+mode);
  return NextResponse.redirect(origin+(members.length?'/app':'/welcome'));
 }catch(e){return NextResponse.redirect(origin+'/?error='+encodeURIComponent(e instanceof Error?e.message:'Login failed.'));}
}
