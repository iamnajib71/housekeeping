import test from 'node:test';
import assert from 'node:assert/strict';
import { beginVideoUpload,sendVideoChunk,queryVideoUpload,getVideoFile,deleteVideoFile,providerUploadUrl } from '../lib/cloud-video';
import { detectVideoCleaningPlan } from '../lib/onboarding-ai';
test('cloud upload destinations are fixed to Google, not arbitrary user URLs',()=>{
  assert.equal(providerUploadUrl('https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=test'),'https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=test');
  assert.throws(()=>providerUploadUrl('https://evil.example/upload/'));
  assert.throws(()=>providerUploadUrl('https://generativelanguage.googleapis.com/private'));
});
test('resumable chunks use exact offsets and finalise once, video plans use time evidence',async()=>{
  const original=globalThis.fetch;const url='https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=test';
  const file={name:'files/test-file',uri:'https://generativelanguage.googleapis.com/v1beta/files/test-file',state:'ACTIVE',videoMetadata:{videoDuration:'10s'}};
  try{
    globalThis.fetch=async(_url,init)=>{
      const headers=init?.headers as Record<string,string>;
      if(headers['X-Goog-Upload-Command']==='start'){assert.equal(headers['X-Goog-Upload-Header-Content-Length'],'4');return new Response('',{headers:{'x-goog-upload-url':url}});}
      if(headers['X-Goog-Upload-Command']==='query')return new Response('',{headers:{'x-goog-upload-size-received':'2'}});
      if(headers['X-Goog-Upload-Command']==='upload'){assert.equal(headers['X-Goog-Upload-Offset'],'0');return new Response('');}
      if(headers['X-Goog-Upload-Command']==='upload, finalize'){assert.equal(headers['X-Goog-Upload-Offset'],'2');return Response.json({file});}
      if(init?.method==='DELETE')return new Response('',{status:200});
      return Response.json(file);
    };
    assert.equal(await beginVideoUpload('key',4,'video/mp4','trial'),url);
    assert.equal(await sendVideoChunk(url,new Uint8Array([1,2]),0,false),null);
    assert.equal(await queryVideoUpload(url),2);
    assert.deepEqual(await sendVideoChunk(url,new Uint8Array([3,4]),2,true),file);
    assert.deepEqual(await getVideoFile('key',file.name),file);await deleteVideoFile('key',file.name);
    globalThis.fetch=async(_url,init)=>{
      const payload=JSON.parse(String(init?.body));assert.equal(payload.contents[0].parts[0].fileData.fileUri,file.uri);
      return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({areas:[{name:'Kitchen',fixtures:['Sink'],daily:['Wipe sink'],weekly:['Deep clean sink'],frameIndex:null,seconds:3,confidence:'high'}],unseenAreas:[],notes:''})}]}}]});
    };
    assert.equal((await detectVideoCleaningPlan(file.uri,'video/mp4','key')).areas[0].seconds,3);
  }finally{globalThis.fetch=original;}
});
