const DEFAULT_TZ = "Asia/Tokyo";

/** Returns YYYY-MM-DD for "today" in the given IANA timezone. */
export function getTodayDate(timezone: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Returns YYYY-MM-DD for n days before the given date string. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Formats YYYY-MM-DD for display, e.g. "7月7日(月)" */
export function formatDateJa(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: DEFAULT_TZ,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}
