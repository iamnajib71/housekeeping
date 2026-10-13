export const MONDAY_BIN_TASK = 'Bins: Empty household bins, replace liners and wipe dirty lids';

export function isWeeklyBinTask(task: string): boolean {
  return /\bbins?\b|\bliners?\b/i.test(task) && !/collection|Tuesday/i.test(task);
}

// Include one indoor bin duty even after a walkthrough or settings replacement.
// Empty properties remain empty until their admin defines a checklist.
export function weeklyTasksWithBins(tasks: string[]): string[] {
  const unique = [...new Set(tasks.map(task => task.trim()).filter(Boolean))];
  return unique.length && !unique.some(isWeeklyBinTask) ? [...unique, MONDAY_BIN_TASK] : unique;
}
