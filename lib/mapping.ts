import { CleaningPlan, OnboardingError } from './onboarding';
import { lightCleaningRoutine } from './onboarding-routine';

export const MAX_MAP_BYTES = 4 * 1024 * 1024;
export type MapPoint = [number, number, number, number, number, number];
export type MapCamera = { seconds: number; position: [number, number, number] };
export type HouseMap = {
  format: 'housekeeping-map-v1'; model: 'lingbot-map'; revision: string;
  duration: number; points: MapPoint[]; cameras: MapCamera[];
  metrics: { inferenceSeconds: number; peakGpuMb: number; frames: number };
};
export type MapArea = { name: string; start: number; end: number; fixtures: string[] };
function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
export function validateHouseMap(value: unknown): HouseMap {
  const m = value as HouseMap | null;
  if (!m || m.format !== 'housekeeping-map-v1' || m.model !== 'lingbot-map' || !/^[a-f0-9]{40}$/.test(m.revision)
    || !finite(m.duration, .01, 60) || !Array.isArray(m.points) || !m.points.length || m.points.length > 30000
    || !Array.isArray(m.cameras) || m.cameras.length < 2 || m.cameras.length > 120) throw new OnboardingError('Choose a valid LingBot-Map trial result (up to 60 seconds).');
  for (const point of m.points) if (!Array.isArray(point) || point.length !== 6 || !point.slice(0,3).every(n => finite(n,-100000,100000))
    || !point.slice(3).every(n => Number.isInteger(n) && finite(n,0,255))) throw new OnboardingError('The map contains invalid points.');
  let previous = -1;
  for (const camera of m.cameras) {
    if (!camera || !finite(camera.seconds,0,m.duration) || camera.seconds <= previous || !Array.isArray(camera.position)
      || camera.position.length !== 3 || !camera.position.every(n => finite(n,-100000,100000))) throw new OnboardingError('The map contains invalid camera positions.');
    previous = camera.seconds;
  }
  if (!m.metrics || !finite(m.metrics.inferenceSeconds,0,86400) || !finite(m.metrics.peakGpuMb,0,1000000)
    || !Number.isInteger(m.metrics.frames) || m.metrics.frames !== m.cameras.length) throw new OnboardingError('The map has invalid benchmark metrics.');
  // Return only supported data. Imported text never becomes HTML or executable code.
  return {format:m.format,model:m.model,revision:m.revision,duration:m.duration,points:m.points,cameras:m.cameras,metrics:m.metrics};
}
export function mapAreasToPlan(value: unknown, duration: unknown): CleaningPlan {
  if (!finite(duration,.01,60) || !Array.isArray(value) || value.length < 1 || value.length > 12) throw new OnboardingError('Label 1–12 areas in a valid short walkthrough.');
  const areas = value.map((a:MapArea) => {
    if (!a || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 60 || !finite(a.start,0,duration)
      || !finite(a.end,0,duration) || a.end < a.start || !Array.isArray(a.fixtures) || a.fixtures.length > 12
      || !a.fixtures.every(f=>typeof f === 'string' && f.trim() && f.length <= 80)) throw new OnboardingError('Check each area name, time range and fixture list.');
    return {name:a.name.trim(),fixtures:[...new Set(a.fixtures.map(f=>f.trim()))],daily:[],weekly:[],frameIndex:null,seconds:a.start,confidence:'low' as const};
  });
  if (new Set(areas.map(a=>a.name.toLowerCase())).size !== areas.length) throw new OnboardingError('Give each area a distinct name.');
  return lightCleaningRoutine({areas,unseenAreas:[],notes:'Areas and fixtures were labelled by the admin using a LingBot-Map reconstruction. Geometry does not identify rooms or verify cleanliness. Confirm these labels and duties before applying.'});
}
