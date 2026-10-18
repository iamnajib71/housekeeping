import type { SelectHTMLAttributes } from 'react';
import { formatTimeOfDay } from '@/lib/display-time';

export function TimeSelect({ value, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value'> & { value: string }) {
  const times = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String(i % 4 * 15).padStart(2, '0')}`);
  // Retain an existing custom minute rather than silently rounding its schedule.
  if (value && !times.includes(value)) times.push(value);
  return <select {...props} value={value}>{times.sort().map(time => <option key={time} value={time}>{formatTimeOfDay(time)}</option>)}</select>;
}
