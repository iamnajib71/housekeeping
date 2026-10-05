export type WasteBin = 'General rubbish' | 'Food & garden organics' | 'Mixed recycling' | 'Glass recycling';
export type WasteCollection = { date: string; bins: WasteBin[] };

const EVERY_WEEK: WasteBin[] = ['General rubbish', 'Food & garden organics'];
const COLLECTIONS: WasteCollection[] = [
  ['2026-09-23', 'mixed'], ['2026-09-30', 'glass'],
  ['2026-10-07', 'mixed'], ['2026-10-14', 'base'], ['2026-10-21', 'mixed'], ['2026-10-28', 'glass'],
  ['2026-11-04', 'mixed'], ['2026-11-11', 'base'], ['2026-11-18', 'mixed'], ['2026-11-25', 'glass'],
  ['2026-12-02', 'mixed'], ['2026-12-09', 'base'], ['2026-12-16', 'mixed'], ['2026-12-23', 'glass'], ['2026-12-30', 'mixed'],
].map(([date, extra]) => ({ date, bins: [...EVERY_WEEK, ...(extra === 'mixed' ? ['Mixed recycling' as const] : extra === 'glass' ? ['Glass recycling' as const] : [])] }));

export function nextWasteCollection(date: string): WasteCollection | undefined {
  return COLLECTIONS.find(item => item.date >= date);
}
export function wasteCollectionsBetween(from: string, to: string): WasteCollection[] {
  return COLLECTIONS.filter(item => item.date >= from && item.date <= to);
}
export function shortBinName(bin: WasteBin): string {
  return ({ 'General rubbish': 'Red lid', 'Food & garden organics': 'Green lid', 'Mixed recycling': 'Yellow lid', 'Glass recycling': 'Purple lid' })[bin];
}

export function binOutTask(date: string): string | undefined {
  if (new Date(date + 'T12:00:00Z').getUTCDay() !== 2) return;
  const tomorrow = new Date(Date.parse(date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const collection = COLLECTIONS.find(item => item.date === tomorrow);
  return collection
    ? 'Put collection bins out Tuesday night: ' + collection.bins.map(shortBinName).join(', ') + ' (Wednesday collection)'
    : 'Put collection bins out Tuesday night; check council calendar for lids due';
}

// Keep the daily fullness check separate from the once-a-week collection duty.
export function dailyTasksForDate(tasks: string[], date: string): string[] {
  const base = tasks
    .filter(task => !task.startsWith('Put collection bins out Tuesday night') && task !== 'Check for Bin Collection (Tuesday)')
    .map(task => task.replace('; put due collection bins out Tuesday night', ''));
  const binTask = binOutTask(date);
  return binTask ? [...base, binTask] : base;
}
