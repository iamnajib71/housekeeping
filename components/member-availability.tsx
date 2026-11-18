'use client';
import {useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {memberAvailable} from '@/lib/availability';
import {formatDate} from '@/lib/schedule';
import {propertyHeaders} from '@/lib/property-context';
import type {Member} from '@/lib/types';

export function MemberAvailability({member,today,admin,onChange}:{member:Member;today:string;admin:boolean;onChange:()=>Promise<void>}) {
 const [from,setFrom]=useState(today),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const planned=Boolean(member.away_from&&(!member.away_until||member.away_until>today));
 async function save(back=false){
  setBusy(true);setError('');setMessage('');
  try{
   const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json',...propertyHeaders()},body:JSON.stringify({action:'availability',id:member.id,...(back?{back:true}:{from})})});
   const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not update availability.');
   await onChange();setMessage(result.protected?`${result.protected} started clean(s) kept unchanged. Please review them.`:'Roster updated.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 if(member.participates===false)return null;
 return <div className="member-availability">
  {planned&&<p className="absence-status"><CalendarDays size={16}/><span>{memberAvailable(member,today)?'Away from '+formatDate(member.away_from!):'Away since '+formatDate(member.away_from!)}<small>{member.away_until?'Returns '+formatDate(member.away_until):'Until marked back by an admin'}</small></span></p>}
  {admin&&(planned?<button className="text-link" disabled={busy} onClick={()=>save(true)}>{busy?'Updating…':member.away_from!>today?'Cancel planned absence':'Mark back today'}</button>:<details><summary>Plan time away</summary><form onSubmit={e=>{e.preventDefault();void save();}}><label>Away from<input aria-label={'Away from for '+member.name} type="date" required min={today} value={from} onChange={e=>setFrom(e.target.value)}/></label><small>Future unstarted turns are shared among available housemates until you mark this person back.</small><button className="button" disabled={busy}>{busy?'Updating…':'Save absence'}</button></form></details>)}
  {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="success" role="status">{message}</p>}
 </div>;
}
