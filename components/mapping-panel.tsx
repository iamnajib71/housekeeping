'use client';
import { useEffect, useRef, useState } from 'react';
import { CleaningPlan, WalkthroughTrial } from '@/lib/onboarding';
import { HouseMap, MapArea, MAX_MAP_BYTES, mapAreasToPlan, validateHouseMap } from '@/lib/mapping';

const notebook='https://colab.research.google.com/github/iamnajib71/housekeeping/blob/main/experiments/lingbot-map/trial.ipynb';
export function MappingPanel({onDraft}:{onDraft:(trial:WalkthroughTrial)=>void}) {
  const [map,setMap]=useState<HouseMap|null>(null),[areas,setAreas]=useState<MapArea[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [yaw,setYaw]=useState(0),[tilt,setTilt]=useState(.5),[zoom,setZoom]=useState(1),[cursor,setCursor]=useState(0);
  const [name,setName]=useState('Kitchen'),[start,setStart]=useState(0),[end,setEnd]=useState(0),[fixtures,setFixtures]=useState('');
  const canvas=useRef<HTMLCanvasElement>(null),input=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    if(!map||!canvas.current)return;
    const ctx=canvas.current.getContext('2d');if(!ctx)return;
    const w=900,h=460;ctx.fillStyle='#111827';ctx.fillRect(0,0,w,h);
    const xs=map.points.map(p=>p[0]),ys=map.points.map(p=>p[1]),zs=map.points.map(p=>p[2]);
    const bounds=(v:number[])=>{let lo=Infinity,hi=-Infinity;for(const n of v){lo=Math.min(lo,n);hi=Math.max(hi,n);}return [lo,hi];};
    const b=[bounds(xs),bounds(ys),bounds(zs)],centre=b.map(v=>(v[0]+v[1])/2),scale=350/Math.max(...b.map(v=>v[1]-v[0]),.001)*zoom;
    const project=(p:number[])=>{const x=p[0]-centre[0],y=p[1]-centre[1],z=p[2]-centre[2],rx=x*Math.cos(yaw)-z*Math.sin(yaw),rz=x*Math.sin(yaw)+z*Math.cos(yaw);return [w/2+rx*scale,h/2+(y*Math.cos(tilt)-rz*Math.sin(tilt))*scale];};
    for(const p of map.points){const [x,y]=project(p);ctx.fillStyle=`rgb(${p[3]},${p[4]},${p[5]})`;ctx.fillRect(x,y,2,2);}
    ctx.strokeStyle='#60a5fa';ctx.lineWidth=3;ctx.beginPath();map.cameras.forEach((c,i)=>{const [x,y]=project(c.position);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
    const selected=map.cameras.reduce((a,b)=>Math.abs(b.seconds-cursor)<Math.abs(a.seconds-cursor)?b:a);const [x,y]=project(selected.position);ctx.fillStyle='#fbbf24';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();
  },[map,yaw,tilt,zoom,cursor]);
  async function load(file?:File){
    if(!file)return;setError('');
    try{if(file.size>MAX_MAP_BYTES)throw new Error('Choose a map smaller than 4 MB.');const raw=JSON.parse(await file.text()),result=validateHouseMap(raw);const labels=Array.isArray(raw.areas)?raw.areas:[];if(labels.length)mapAreasToPlan(labels,result.duration);setMap(result);setAreas(labels);setStart(0);setEnd(result.duration);setCursor(0);setYaw(0);setZoom(1);}
    catch(e){setError((e as Error).message);}finally{if(input.current)input.current.value='';}
  }
  function addArea(){try{const next=[...areas,{name,start,end,fixtures:fixtures.split(',').map(f=>f.trim()).filter(Boolean)}];mapAreasToPlan(next,map?.duration);setAreas(next);setName('');setFixtures('');setError('');}catch(e){setError((e as Error).message);}}
  async function saveDraft(){if(!map)return;setBusy(true);setError('');try{
    const response=await fetch('/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'import_map',areas,duration:map.duration})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not save the mapping draft.');onDraft(data);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function download(){if(!map)return;const blob=new Blob([JSON.stringify({...map,areas})],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='housekeeping-labelled-map.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  let preview:CleaningPlan|null=null;try{if(areas.length&&map)preview=mapAreasToPlan(areas,map.duration);}catch{}
  return <details className="mapping-trial"><summary>Experimental 3D home mapping</summary><p>Run a short walkthrough in the cloud notebook, then import its map here. This trial does not change your household until you review and apply a cleaning draft.</p>
    <ol><li><a className="text-link" href={notebook} target="_blank" rel="noreferrer">Open free Colab trial</a>. Choose a GPU runtime and follow the notebook. Free GPU access is limited and may be unavailable.</li><li>Use a 15–30 second continuous video of shared areas, up to 60 seconds. You choose whether to upload it to Google Colab.</li><li>Download the result JSON and import it below. Label the rooms and visible fixtures yourself; reconstruction only supplies geometry.</li></ol>
    <input ref={input} type="file" accept="application/json,.json" aria-label="Import 3D map file" hidden onChange={e=>load(e.target.files?.[0])}/><button className="button" disabled={busy} onClick={()=>input.current?.click()}>Import map result</button>
    {map&&<div className="map-result"><p>{map.metrics.frames} frames · {map.duration.toFixed(1)} seconds of video · inference {map.metrics.inferenceSeconds.toFixed(1)}s · peak GPU {Math.round(map.metrics.peakGpuMb)} MB</p><canvas ref={canvas} width={900} height={460} aria-label="Reconstructed home map with blue camera path and yellow current position"/><p className="muted">Geometry can drift or miss surfaces. The map has no verified scale in metres. Select a video time to locate the camera; compare with your original video.</p>
      <div className="mapping-controls"><label>Rotate<input type="range" min={-3.14} max={3.14} step={.02} value={yaw} onChange={e=>setYaw(Number(e.target.value))}/></label><label>Tilt<input type="range" min={-1.5} max={1.5} step={.02} value={tilt} onChange={e=>setTilt(Number(e.target.value))}/></label><label>Zoom<input type="range" min={.3} max={3} step={.05} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label><label>Video time · {cursor.toFixed(1)}s<input type="range" min={0} max={map.duration} step={.1} value={cursor} onChange={e=>setCursor(Number(e.target.value))}/></label></div>
      <h4>Label an area</h4><div className="mapping-controls"><label>Area name<input maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="Toilet 1"/></label><label>Start time (seconds)<input type="number" min={0} max={map.duration} step={.1} value={start} onChange={e=>setStart(Number(e.target.value))}/></label><label>End time (seconds)<input type="number" min={0} max={map.duration} step={.1} value={end} onChange={e=>setEnd(Number(e.target.value))}/></label><label>Visible fixtures (comma separated)<input value={fixtures} maxLength={1000} onChange={e=>setFixtures(e.target.value)} placeholder="Sink, oven, stovetop"/></label></div><button className="button" disabled={busy} onClick={addArea}>Add labelled area</button>
      <ul>{areas.map((a,i)=><li key={i}>{a.name} · {a.start}–{a.end}s <button className="text-link" disabled={busy} onClick={()=>setAreas(areas.filter((_,j)=>j!==i))} aria-label={`Remove mapped area ${a.name}`}>Remove</button></li>)}</ul>
      {preview&&<p>{preview.areas.flatMap(a=>a.daily).length} quick daily checks · {preview.areas.flatMap(a=>a.weekly).length} grouped Monday duties suggested. Tuesday bin duty is added automatically.</p>}
      <div className="button-row"><button className="button" onClick={download}>Download labelled map</button><button className="button primary" disabled={busy||!areas.length} onClick={saveDraft}>{busy?'Saving…':'Create cleaning draft'}</button></div><small>The map stays in this browser tab until you download it. Only your area labels, fixtures and time ranges are sent when you create a draft.</small></div>}
    {error&&<p className="error" role="alert">{error}</p>}
  </details>;
}
