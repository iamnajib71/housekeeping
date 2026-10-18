/** Human-facing clock labels; stored values stay in 24-hour Melbourne wall time. */
export function formatTimeOfDay(value: string | number): string {
  const [hour, minute = 0] = typeof value === 'number' ? [value, 0] : value.split(':').map(Number);
  return `${hour % 12 || 12}${minute ? ':' + String(minute).padStart(2, '0') : ''}${hour < 12 ? 'am' : 'pm'}`;
}

export function formatLocalDateTime(value: string | Date): string {
  return new Date(value).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).replace(/:00(?=\s*[ap]m\b)/i, '').replace(/\s+([ap]m)\b/gi, (_, suffix: string) => suffix.toLowerCase());
}
