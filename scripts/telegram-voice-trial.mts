// Manual trial only. Not part of the nightly scheduler.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const token=process.env.TELEGRAM_BOT_TOKEN;
if(!token)throw new Error('Add TELEGRAM_BOT_TOKEN to .env.local, never to chat or GitHub.');
async function api(method:string,body:BodyInit){
 const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',body,signal:AbortSignal.timeout(20000)});
 const data=await response.json();
 if(!data.ok)throw new Error(`Telegram ${method} failed (${data.error_code||response.status}).`);
 return data.result;
}
try{
 await mkdir('.local',{recursive:true});
 const me=await api('getMe',new URLSearchParams());
 if(process.argv.includes('--discover')){
  const updates=await api('getUpdates',new URLSearchParams({timeout:'0',allowed_updates:'["message"]'}));
  const starts=updates.filter((u:any)=>u.message?.chat.type==='private'&&/^\/start(?:\s|$)/.test(u.message.text||'')&&u.message.from?.id===u.message.chat.id);
  const chats=Array.from(new Map(starts.map((u:any)=>[u.message.chat.id,u.message.chat])).values());
  await writeFile('.local/telegram-trial-candidates.json',JSON.stringify(chats));
  console.log(JSON.stringify({bot:me.username,privateStarts:chats.length,names:chats.map((c:any)=>c.first_name)}));
 }else{
  const chat=process.env.TELEGRAM_TEST_CHAT_ID;
  if(!chat||!/^\d+$/.test(chat))throw new Error('Set the explicitly selected private TELEGRAM_TEST_CHAT_ID in .env.local.');
  const destination=await api('getChat',new URLSearchParams({chat_id:chat}));
  if(destination.type!=='private')throw new Error('Trial only sends to a private chat.');
  const receiptPath='.local/telegram-voice-trial-receipt.json';
  let receipt:any;try{receipt=JSON.parse(await readFile(receiptPath,'utf8'));}catch{}
  if(receipt?.bot===me.id&&receipt?.chat===chat)throw new Error('This trial was already sent. Do not send duplicates.');
  const audio=await readFile(resolve(process.argv[2]||'.local/telegram-reminder-test.ogg'));
  const body=new FormData();body.set('chat_id',chat);body.set('voice',new Blob([audio],{type:'audio/ogg'}),'housekeeping-test.ogg');
  body.set('caption','Housekeeping voice reminder trial — this is only a test.');
  body.set('reply_markup',JSON.stringify({inline_keyboard:[[{text:'Open Housekeeping',url:'https://housekeeping-najib.vercel.app/app'}]]}));
  const message=await api('sendVoice',body);
  await writeFile(receiptPath,JSON.stringify({bot:me.id,chat,messageId:message.message_id,sentAt:new Date().toISOString(),duration:message.voice?.duration}));
  console.log(JSON.stringify({accepted:true,messageId:message.message_id,voiceNote:Boolean(message.voice),seconds:message.voice?.duration}));
 }
}catch(e){console.error(e instanceof Error&&!e.message.includes(token!)?e.message:'Telegram trial failed. Check the connection.');process.exitCode=1;}
