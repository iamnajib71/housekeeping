export const MAX_WALKTHROUGH_SECONDS = 180;
export const MAX_WALKTHROUGH_FRAMES = 16;
export const MAX_FRAME_BASE64 = 200_000;
export type WalkthroughFrame = { seconds: number; data: string };
export type CleaningArea = {
  name: string; fixtures: string[]; daily: string[]; weekly: string[];
  frameIndex: number | null; confidence: 'high' | 'medium' | 'low';
  seconds?: number | null;
};
export type CleaningPlan = { areas: CleaningArea[]; unseenAreas: string[]; notes: string };
export type WalkthroughTrial = {
  id: string; created_at: string; status: 'analyzing' | 'ready' | 'failed' | 'uploading' | 'processing';
  plan: CleaningPlan | null; frame_times: number[]; applied_at: string | null;
};
export class OnboardingError extends Error {}
function text(value: unknown, max: number, label: string, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new OnboardingError(`Enter a valid ${label} (up to ${max} characters).`);
  return value.trim();
}
function list(value: unknown, max: number, length: number, label: string): string[] {
  if (!Array.isArray(value) || value.length > max) throw new OnboardingError(`Use up to ${max} ${label}.`);
  return [...new Set(value.map(item => text(item, length, label)))];
}
export function validateFrames(value: unknown): WalkthroughFrame[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_WALKTHROUGH_FRAMES) throw new OnboardingError('Choose 1–16 video snapshots.');
  return value.map(f => {
    if (!f || typeof f.seconds !== 'number' || !Number.isFinite(f.seconds) || f.seconds < 0 || f.seconds > MAX_WALKTHROUGH_SECONDS
      || typeof f.data !== 'string' || f.data.length < 20 || f.data.length > MAX_FRAME_BASE64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(f.data)
      || !f.data.startsWith('/9j/')) throw new OnboardingError('A snapshot is invalid or too large. Prepare the video again.');
    return { seconds: f.seconds, data: f.data };
  });
}
export function validatePlan(value: unknown, frameCount = MAX_WALKTHROUGH_FRAMES): CleaningPlan {
  const p = value as Partial<CleaningPlan> | null;
  if (!p || !Array.isArray(p.areas) || p.areas.length > 12) throw new OnboardingError('Use up to 12 cleaning areas.');
  const areas = p.areas.map(a => {
    if (!a || !['high','medium','low'].includes(a.confidence) || (a.frameIndex !== null && (!Number.isInteger(a.frameIndex) || a.frameIndex < 0 || a.frameIndex >= frameCount))) throw new OnboardingError('An area has invalid snapshot evidence.');
    if(a.seconds !== undefined && a.seconds !== null && (!Number.isFinite(a.seconds)||a.seconds<0||a.seconds>MAX_WALKTHROUGH_SECONDS))throw new OnboardingError('An area has an invalid video timestamp.');
    return {name:text(a.name,60,'area name'),fixtures:list(a.fixtures,12,80,'fixtures'),daily:list(a.daily,10,150,'daily duties'),weekly:list(a.weekly,12,150,'weekly duties'),frameIndex:a.frameIndex,confidence:a.confidence,...(a.seconds!==undefined?{seconds:a.seconds}:{})};
  });
  if (new Set(areas.map(a=>a.name.toLowerCase())).size !== areas.length) throw new OnboardingError('Give each area a distinct name, or merge duplicate areas.');
  return {areas,unseenAreas:list(p.unseenAreas,12,100,'areas needing confirmation'),notes:text(p.notes,1000,'plan note',true)};
}
export function planChecklists(plan: CleaningPlan) {
  const daily = [...new Set(plan.areas.flatMap(a=>a.daily.map(task=>`${a.name}: ${task}`)))];
  const weekly = [...new Set(plan.areas.flatMap(a=>a.weekly.map(task=>`${a.name}: ${task}`)))];
  for (const [label,tasks] of [['daily',daily],['weekly',weekly]] as const) {
    if (!tasks.length || tasks.length > 30) throw new OnboardingError(`The ${label} checklist needs 1–30 duties.`);
    if (tasks.some(t=>t.length>150)) throw new OnboardingError(`Shorten the ${label} duties: area name plus duty must fit within 150 characters.`);
  }
  return {daily,weekly,areas:plan.areas.map(a=>a.name)};
}
export function snapshotTimes(duration: number, count = 12) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_WALKTHROUGH_SECONDS) throw new OnboardingError('Use a video up to 3 minutes long.');
  const total = Math.min(MAX_WALKTHROUGH_FRAMES, Math.max(1, Math.floor(count)), Math.max(1,Math.ceil(duration)));
  return Array.from({length:total},(_,i)=>duration*(i+.5)/total);
}
export function timeLabel(seconds: number) {
  return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
}
export const planSchema = {
  type:'OBJECT',required:['areas','unseenAreas','notes'],properties:{
    areas:{type:'ARRAY',maxItems:12,items:{type:'OBJECT',required:['name','fixtures','daily','weekly','frameIndex','confidence'],properties:{
      name:{type:'STRING'},fixtures:{type:'ARRAY',items:{type:'STRING'}},daily:{type:'ARRAY',items:{type:'STRING'}},weekly:{type:'ARRAY',items:{type:'STRING'}},
      frameIndex:{type:'INTEGER',nullable:true},confidence:{type:'STRING',enum:['high','medium','low']}
      ,seconds:{type:'NUMBER',nullable:true}
    }}},unseenAreas:{type:'ARRAY',items:{type:'STRING'}},notes:{type:'STRING'}
  }
};
