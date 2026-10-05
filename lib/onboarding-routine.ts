import { CleaningPlan, OnboardingError, planChecklists } from './onboarding';

export const DAILY_RESET_GUIDANCE = `The household is busy. Daily cleaning is one person's quick reset, targeting roughly 10–15 minutes, not a whole-house deep clean. Suggest at most six daily checkboxes across the entire home, not per area: kitchen benches/surfaces; stovetop spills and beside it; kitchen clutter and sink; check bins and empty ONLY when over 80% full; spot-check shared areas for visible dirt and clean only as needed; a quick bathroom/toilet hygiene check for fresh spills or mess ONLY as needed. Leave daily arrays empty on other areas. Toilet scrubbing, bathtub/shower cleaning, dusting, appliance exteriors and full-floor cleaning belong on Monday. Group related weekly actions into one or two concise duties per area; a two-person team shares the Monday work. Windows/blinds, light fixtures, cabinet organizing and oven interiors are occasional/as-needed work, not a mandatory weekly list. Do not invent unseen areas or fixtures. If no kitchen is visible, say it needs confirmation and suggest only a short reset for the visible area.`;

const kitchenDaily = [
  'Wipe kitchen benches and surfaces',
  'Clean the stovetop and beside it if needed',
  'Clear kitchen clutter and rinse or wipe the sink',
  'Check bins; empty only when over 80% full',
];
const spotCheck = 'Check shared areas for dirt; spot-clean only as needed';
const hygieneCheck = 'Check bathroom/toilet hygiene; wipe fresh spills or mess only as needed';
const touchpointCheck = 'Check shared touchpoints; wipe sticky or dirty spots only as needed';
const fallbackDaily = ['Clear unnecessary items', 'Spot-clean visible dirt only as needed'];

function weeklyForArea(area: CleaningPlan['areas'][number]): string[] {
  const fixtures = area.fixtures.join(' ').toLowerCase();
  const has = (pattern: RegExp) => pattern.test(fixtures);
  if (/kitchen|kitchenette/i.test(area.name)) {
    const cooking = [has(/stove|hob|cooktop/) && 'stovetop', has(/oven/) && 'oven', has(/microwave/) && 'microwave'].filter(Boolean);
    const duties = [`Deep-clean kitchen surfaces${has(/sink|basin/) ? ' and sink' : ''}; wipe visible exteriors; sweep/mop floor`];
    if (cooking.length) duties.push(`Clean ${cooking.join(', ')}; do interior cleaning only as needed`);
    return duties;
  }
  if (/toilet|restroom|\bwc\b/i.test(area.name)) return [`Scrub toilet bowl; clean seat and exterior${has(/sink|basin/) ? ' and sink' : ''}; sweep/mop floor`];
  if (/bathroom|shower room/i.test(area.name)) {
    const wet = [has(/sink|basin/) && 'sink',has(/mirror/) && 'mirror',has(/shower/) && 'shower',has(/bathtub|\bbath\b/) && 'bathtub',has(/toilet/) && 'toilet'].filter(Boolean);
    return [`Deep-clean ${wet.length ? wet.join(', ') : 'bathroom surfaces'}; mop floor`];
  }
  if (/laundry/i.test(area.name)) {
    const wet = [has(/sink|tub|basin/) && 'laundry sink',has(/washing machine|washer/) && 'washing machine exterior'].filter(Boolean);
    return [`Clean ${wet.length ? wet.join(' and ') : 'laundry surfaces'}; tidy shared supplies; sweep/mop floor`];
  }
  if (/living|lounge|common|dining/i.test(area.name)) return ['Vacuum/sweep floor; wipe tables and dust reachable surfaces; tidy shared items'];
  if (/hall|entry|corridor/i.test(area.name)) return ['Sweep/vacuum and mop floor; dust reachable panels and surfaces'];
  const grouped = groupWeekly([...area.weekly,...area.daily.filter(task=>!fallbackDaily.includes(task))],area.name);
  return grouped.length ? grouped : ['Clean shared surfaces and sweep/mop floor'];
}

function groupWeekly(tasks: string[], areaName: string): string[] {
  const max = 150 - areaName.length - 2;
  const unique = [...new Map(tasks.map(task => [task.toLowerCase(), task])).values()];
  const grouped: string[] = [];
  for (const task of unique) {
    if (task.length > max) throw new OnboardingError('Shorten the suggested weekly duty before saving.');
    const previous = grouped.at(-1);
    if (previous && previous.length + task.length + 2 <= max) grouped[grouped.length - 1] = `${previous}; ${task}`;
    else grouped.push(task);
  }
  return grouped;
}

// Apply only to generated suggestions, never silently rewrite an admin's edits.
// Preserve detected areas/evidence and use concise, fixture-aware Monday groups.
export function lightCleaningRoutine(plan: CleaningPlan): CleaningPlan {
  if (!plan.areas.length) return plan;
  const kitchen = plan.areas.find(a => /kitchen|kitchenette/i.test(a.name));
  const shared = plan.areas.find(a => a !== kitchen && /living|lounge|common|hall|dining/i.test(a.name));
  const hygiene = plan.areas.find(a => /bathroom|toilet|restroom|\bwc\b/i.test(a.name));
  const resetArea = kitchen || plan.areas[0];
  const spotArea = shared || resetArea;
  const areas = plan.areas.map(area => {
    const daily = area === resetArea ? [...(kitchen ? kitchenDaily : fallbackDaily)] : [];
    if (kitchen && area === spotArea) daily.push(spotCheck);
    if (kitchen && area === (hygiene || spotArea)) daily.push(hygiene ? hygieneCheck : touchpointCheck);
    return {...area, daily, weekly:weeklyForArea(area)};
  });
  const count = areas.reduce((n, area) => n + area.daily.length, 0);
  const note = `Daily reset: ${count} quick checkboxes for one person, aiming for 10–15 minutes. Bins and spot-cleaning are conditional. Monday covers deeper cleaning for two people. Windows, lights and cabinet organizing are occasional/as needed.${kitchen ? '' : ' Kitchen was not shown; confirm the daily kitchen routine.'}`;
  const notes = plan.notes.startsWith(note) ? plan.notes : `${note}\n${plan.notes}`.slice(0, 1000);
  const unseenAreas = !kitchen && !plan.unseenAreas.some(a=>/kitchen/i.test(a)) && plan.unseenAreas.length<12 ? [...plan.unseenAreas,'Kitchen (not shown; confirm daily routine)'] : plan.unseenAreas;
  const result = {...plan, areas, notes, unseenAreas};
  planChecklists(result);
  return result;
}
