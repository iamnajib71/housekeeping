'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, LoaderCircle, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { CleaningArea, CleaningPlan, planChecklists, timeLabel, WalkthroughTrial } from '@/lib/onboarding';
import { MAX_VIDEO_BYTES, VIDEO_CHUNK_BYTES, VIDEO_TYPES } from '@/lib/cloud-video';

async function request(body?: unknown) {
  const r=await fetch('/api/onboarding',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
  const result=await r.json();if(!r.ok)throw new Error(result.error||'The walkthrough could not be saved.');return result;
}
const emptyArea=():CleaningArea=>({name:'New area',fixtures:[],daily:[],weekly:[],frameIndex:null,confidence:'low'});
export function OnboardingPanel({onApplied}:{onApplied:()=>Promise<void>}) {
  const [configured,setConfigured]=useState(false),[trials,setTrials]=useState<WalkthroughTrial[]>([]),[loading,setLoading]=useState(true);
  const [videoFile,setVideoFile]=useState<File|null>(null);
  const [trial,setTrial]=useState<WalkthroughTrial|null>(null),[plan,setPlan]=useState<CleaningPlan|null>(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[consent,setConsent]=useState(false),[confirmApply,setConfirmApply]=useState(false);
  const upload=useRef<HTMLInputElement>(null),capture=useRef<HTMLInputElement>(null),alive=useRef(true);
  async function refresh(){const data=await request();if(alive.current){setConfigured(data.configured);setTrials(data.trials);}}
  useEffect(()=>{alive.current=true;refresh().catch(e=>{if(alive.current)setError(e.message);}).finally(()=>{if(alive.current)setLoading(false);});return()=>{alive.current=false;};},[]);
  async function prepare(file?:File){
    if(!file)return;setError('');setMessage('');setConsent(false);
    if(file.size>MAX_VIDEO_BYTES||!VIDEO_TYPES.includes(file.type||'video/mp4')){setError('Choose a supported video smaller than 250 MB.');return;}
    setVideoFile(file);
    if(upload.current)upload.current.value='';if(capture.current)capture.current.value='';
  }
  async function finishVideo(id:string){
    for(let attempt=0;attempt<60;attempt++){
      setProgress('Google is processing the video and identifying cleaning areas…');
      const result=await request({action:'analyse_video',id});
      if(!alive.current)return;
      if(!result.processing){setTrial(result);setPlan(result.plan);setMessage('Draft ready. Review every area and duty before applying.');await refresh();return;}
      await new Promise(resolve=>setTimeout(resolve,2500));
    }
    throw new Error('Google is still processing. Use Continue cloud analysis below to check again.');
  }
  async function analyse(){
    if(!videoFile)return;setBusy(true);setError('');setMessage('');setConfirmApply(false);setProgress('Starting a secure cloud upload…');
    try {
      const started=await request({action:'start_video',size:videoFile.size,mimeType:videoFile.type||'video/mp4',consent});setTrial(started);setPlan(null);
      let offset=0;
      while(offset<videoFile.size){
        if(!alive.current)return;
        setProgress(`Uploading video to Google: ${Math.round(offset/videoFile.size*100)}%…`);
        const chunk=videoFile.slice(offset,Math.min(videoFile.size,offset+VIDEO_CHUNK_BYTES));let next:any=null;
        for(let retry=0;retry<3;retry++){
          try{const response=await fetch(`/api/onboarding/${started.id}/upload`,{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upload-offset':String(offset)},body:chunk});const result=await response.json();if(!response.ok)throw new Error(result.error||'Video upload interrupted.');next=result;break;}
          catch(e){if(retry===2)throw e;await new Promise(resolve=>setTimeout(resolve,1500));}
        }
        if(!next||next.nextOffset<=offset||next.nextOffset>videoFile.size)throw new Error('The cloud upload did not advance. Choose the video again.');offset=next.nextOffset;
      }
      setTrial({...started,status:'processing'});await finishVideo(started.id);
    }
    catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current){setBusy(false);setProgress('');}}
  }
  function updateArea(index:number,values:Partial<CleaningArea>){setPlan(old=>old?{...old,areas:old.areas.map((a,i)=>i===index?{...a,...values}:a)}:old);setConfirmApply(false);setMessage('');}
  async function save(apply=false){
    if(!trial||!plan)return;setBusy(true);setError('');setMessage('');
    try {
      const cleanPlan={...plan,areas:plan.areas.map(a=>({...a,name:a.name.trim(),daily:a.daily.map(t=>t.trim()).filter(Boolean),weekly:a.weekly.map(t=>t.trim()).filter(Boolean)}))};
      if(apply)planChecklists(cleanPlan);
      const result=await request({action:apply?'apply':'save',id:trial.id,plan:cleanPlan});
      if(alive.current)setPlan(cleanPlan);
      if(apply){await onApplied();if(alive.current)setMessage(`Setup replaced across the app. ${result.changed} unstarted assignments updated. Started work and submitted history are preserved.`);}
      else if(alive.current)setMessage('Trial draft saved. The active cleaning setup has not changed.');
      if(alive.current){setConfirmApply(false);await refresh();}
    }catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}
  }
  const checklistPreview=plan?.areas.flatMap(area=>[...area.daily.map(task=>({kind:'Daily',task:`${area.name}: ${task}`})),...area.weekly.map(task=>({kind:'Weekly',task:`${area.name}: ${task}`}))])||[];
  return <section className="card onboarding-panel">
    <div className="section-heading"><div><span className="eyebrow">ADMIN ONBOARDING · TRIAL</span><h2>Set up your home from a walkthrough</h2><p>Record the shared areas once. Review suggested duties, then choose when to replace the active setup.</p></div><Sparkles size={23}/></div>
    {loading?<p><LoaderCircle className="spin" size={16}/> Checking walkthrough setup…</p>:<>
      {!configured&&<div className="notice">Video analysis needs a Gemini API key in the app’s server settings. Your existing cleaning routine is available as usual.</div>}
      <div className="walkthrough-guide"><b>A slow walkthrough works best</b><p>Use a video up to 3 minutes / 250 MB. Pause briefly at benches, appliances and each room. Spoken room names can help. Record common areas only; avoid people, private conversations and personal documents.</p><small>Analysis runs in Google’s cloud. Upload chunks pass through private temporary storage and are removed as they are forwarded. Google’s temporary video is deleted after analysis; interrupted uploads are cleaned up later. Housekeeping retains the editable plan. Use a Google project with billing disabled to stay on the free tier.</small></div>
      <div className="button-row"><button className="button" disabled={busy} onClick={()=>upload.current?.click()}><Upload size={16}/>Choose walkthrough video</button><button className="button" disabled={busy} onClick={()=>capture.current?.click()}><Camera size={16}/>Record walkthrough</button></div>
      <input hidden ref={upload} type="file" accept="video/*" onChange={e=>prepare(e.target.files?.[0])}/><input hidden ref={capture} type="file" accept="video/*" capture="environment" onChange={e=>prepare(e.target.files?.[0])}/>
      {videoFile&&<div className="walkthrough-snapshots"><h3>Walkthrough ready to upload</h3><p>{videoFile.name} · {(videoFile.size/1024/1024).toFixed(1)} MB</p><label className="walkthrough-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/><span>Send this video, including any audio, to Google Gemini for cloud analysis. Google’s free tier may use inputs to improve its products. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Data terms</a></span></label><button className="button primary" disabled={busy||!configured||!consent} onClick={analyse}><Sparkles size={16}/>Analyse walkthrough</button><small className="walkthrough-limit">Free-tier trial: 20 attempts per 24 hours, at least one minute apart. Google’s available quota also applies; there is no paid fallback.</small></div>}
      {trial?.status==='processing'&&!busy&&<button className="button" onClick={async()=>{setBusy(true);setError('');try{await finishVideo(trial.id);}catch(e){setError((e as Error).message);}finally{if(alive.current){setBusy(false);setProgress('');}}}}>Continue cloud analysis</button>}
      {progress&&<p className="upload-progress" role="status"><LoaderCircle className="spin" size={16}/>{progress}</p>}
      {trials.some(t=>['ready','processing'].includes(t.status))&&<label className="trial-picker">Saved trial drafts<select aria-label="Saved trial drafts" disabled={busy} value={trial?.id||''} onChange={e=>{const t=trials.find(t=>t.id===e.target.value);if(t){setTrial(t);setPlan(t.plan);setConfirmApply(false);setMessage('');setError('');}}}><option value="">Choose a saved draft</option>{trials.filter(t=>['ready','processing'].includes(t.status)).map(t=><option value={t.id} key={t.id}>{new Date(t.created_at).toLocaleString('en-AU',{timeZone:'Australia/Melbourne'})}{t.applied_at?' · Applied':t.status==='processing'?' · Processing':''}</option>)}</select></label>}
      {plan&&trial&&<div className="walkthrough-review"><div className="section-heading"><div><h3>Review your proposed setup</h3><p className="muted">Rename, remove or add areas. Edit duties and their daily/weekly frequency. Nothing changes until you apply.</p></div><button className="button" disabled={busy||plan.areas.length>=12} onClick={()=>{setPlan({...plan,areas:[...plan.areas,emptyArea()]});setConfirmApply(false);}}><Plus size={16}/>Add area</button></div>
        {plan.notes&&<p className="notice">{plan.notes}</p>}
        {plan.unseenAreas.length>0&&<div className="notice"><b>Needs your confirmation:</b> {plan.unseenAreas.join(' · ')}. Add any missing areas below or try another walkthrough.</div>}
        {!plan.areas.length&&<p>No clear areas were detected. Add areas manually or try a clearer walkthrough.</p>}
        <div className="walkthrough-areas">{plan.areas.map((area,index)=>{const seconds=area.frameIndex!==null?trial.frame_times[area.frameIndex]:area.seconds??undefined;return <article className="walkthrough-area" key={index}>
          <div className="walkthrough-area-heading"><label>Area name<input maxLength={60} value={area.name} disabled={busy} onChange={e=>updateArea(index,{name:e.target.value})}/></label><button className="icon-button" aria-label={`Remove area ${index+1}`} disabled={busy} onClick={()=>{setPlan({...plan,areas:plan.areas.filter((_,i)=>i!==index)});setConfirmApply(false);}}><Trash2 size={17}/></button></div>
          <div className="walkthrough-evidence"><small>{seconds!==undefined?`Seen around ${timeLabel(seconds)}`:'No supporting timestamp'} · {area.confidence==='low'?'Needs close review':area.confidence==='medium'?'Check the detection':'Clearer detection'}{area.fixtures.length>0&&<span>Visible: {area.fixtures.join(', ')}</span>}</small></div>
          <div className="walkthrough-duty-fields"><label>Daily duties<textarea rows={3} disabled={busy} value={area.daily.join('\n')} onChange={e=>updateArea(index,{daily:e.target.value.split('\n')})} placeholder="One light maintenance duty per line"/></label><label>Weekly duties<textarea rows={3} disabled={busy} value={area.weekly.join('\n')} onChange={e=>updateArea(index,{weekly:e.target.value.split('\n')})} placeholder="One deeper cleaning duty per line"/></label></div>
        </article>;})}</div>
        <div className="button-row"><button className="button" disabled={busy} onClick={()=>save(false)}>Save trial draft</button><button className="button primary" disabled={busy||!plan.areas.length} onClick={()=>{setError('');try{planChecklists({...plan,areas:plan.areas.map(a=>({...a,daily:a.daily.map(t=>t.trim()).filter(Boolean),weekly:a.weekly.map(t=>t.trim()).filter(Boolean)}))});setConfirmApply(true);}catch(e){setError((e as Error).message);}}}>Preview replacement</button></div>
        {confirmApply&&<section className="walkthrough-apply"><h3>Replace the current setup?</h3><p>These areas and duties will replace the active setup across dashboards, settings and today’s/future unstarted assignments. Work already started or submitted keeps its original checklist, proof and feedback. Reminder times and the member rotation stay the same.</p><div className="replacement-checklists">{(['Daily','Weekly'] as const).map(kind=><div key={kind}><b>{kind} · {checklistPreview.filter(t=>t.kind===kind&&t.task.split(': ').slice(1).join(': ').trim()).length} duties</b><ul>{checklistPreview.filter(t=>t.kind===kind&&t.task.split(': ').slice(1).join(': ').trim()).map((t,i)=><li key={i}>{t.task}</li>)}</ul></div>)}</div><div className="button-row"><button className="button" disabled={busy} onClick={()=>setConfirmApply(false)}>Keep editing</button><button className="button primary" disabled={busy} onClick={()=>save(true)}><Check size={16}/>Confirm & replace setup</button></div></section>}
      </div>}
    </>}
    {message&&<p className="success" role="status">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
