const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Binary sizes with locale-aware decimals, e.g. "1,5 GB" in Vietnamese. */
export function formatBytes(bytes: number, locale: string): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits })} ${UNITS[unit]}`;
}

export function formatDateTime(date: Date | undefined, locale: string): string {
  if (!date) return '';
  return date.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

/** "1:05:09" / "4:07" style durations for upload ETAs. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
