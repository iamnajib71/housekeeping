import { NextResponse } from 'next/server';
import { requireMember, sessionClient } from '@/lib/server';
export async function GET(request:Request){
 const url=new URL(request.url),origin=process.env.VERCEL?url.origin:new URL(process.env.APP_URL||url.origin).origin;
 try{
  const code=url.searchParams.get('code');if(!code)throw new Error('Google login was cancelled. Please try again.');
  const client=await sessionClient();const {error}=await client.auth.exchangeCodeForSession(code);if(error)throw error;
  try{await requireMember();}catch(e){await client.auth.signOut();throw e;}
  return NextResponse.redirect(origin+'/app');
 }catch(e){return NextResponse.redirect(origin+'/?error='+encodeURIComponent(e instanceof Error?e.message:'Login failed.'));}
}
