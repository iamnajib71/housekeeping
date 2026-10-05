import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { relayVideoChunk, clearVideoBuffer, PROVIDER_CHUNK_BYTES } from '../lib/video-relay';
import { VIDEO_CHUNK_BYTES } from '../lib/cloud-video';

test('private relay groups four Vercel chunks, finalizes remaining bytes, and clears temporary objects',async()=>{
  const original=globalThis.fetch,objects=new Map<string,Uint8Array>();let received=0,uploads=0;
  const file={name:'files/test',uri:'https://generativelanguage.googleapis.com/v1beta/files/test',state:'PROCESSING'};
  const store={upload:async(name:string,bytes:Uint8Array)=>{objects.set(name,bytes);return {error:null};},download:async(name:string)=>({data:objects.has(name)?new Blob([objects.get(name)! as BlobPart]):null,error:null}),remove:async(paths:string[])=>{paths.forEach(p=>objects.delete(p));return {error:null};},list:async()=>({data:[...objects.keys()].map(p=>({name:p.split('/')[1]})),error:null})};
  const db={storage:{from:()=>store}} as unknown as SupabaseClient;
  const trial={id:'trial',upload_url:'https://generativelanguage.googleapis.com/upload/test',upload_size:PROVIDER_CHUNK_BYTES+10};
  try {
    globalThis.fetch=async(_url,init)=>{
      const headers=init!.headers as Record<string,string>;
      if(headers['X-Goog-Upload-Command']==='query')return new Response('',{headers:{'x-goog-upload-size-received':String(received)}});
      const body=init!.body as Uint8Array;assert.equal(Number(headers['X-Goog-Upload-Offset']),received);uploads++;
      if(headers['X-Goog-Upload-Command']==='upload'){assert.equal(body.length,PROVIDER_CHUNK_BYTES);for(let i=0;i<4;i++)assert.equal(body[i*VIDEO_CHUNK_BYTES],i+1);received+=body.length;return new Response('');}
      assert.equal(body.length,10);received+=body.length;return Response.json({file});
    };
    for(let i=0;i<4;i++){
      const result=await relayVideoChunk(db,trial,new Uint8Array(VIDEO_CHUNK_BYTES).fill(i+1),i*VIDEO_CHUNK_BYTES);
      assert.equal(result.file,null);assert.equal(result.paths.length,i===3?4:0);
      if(i===3){
        // Network acknowledgement lost after Google committed: no duplicate upload.
        const recovered=await relayVideoChunk(db,trial,new Uint8Array(VIDEO_CHUNK_BYTES).fill(4),3*VIDEO_CHUNK_BYTES);assert.equal(recovered.paths.length,4);assert.equal(uploads,1);
        await store.remove(result.paths);
      }
    }
    const final=await relayVideoChunk(db,trial,new Uint8Array(10),PROVIDER_CHUNK_BYTES);assert.deepEqual(final.file,file);assert.equal(uploads,2);
    await clearVideoBuffer(db,'trial');assert.equal(objects.size,0);
  }finally{globalThis.fetch=original;}
});
