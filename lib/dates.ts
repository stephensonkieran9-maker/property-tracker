// Date helpers. Everything on the board is in UK time.
const TZ = "Europe/London";

/** "YYYY-MM-DD HH:mm" in London time for a Date (default now). */
export function londonStamp(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  const hour = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")} ${hour}:${g("minute")}`;
}

export function londonToday(): string {
  return londonStamp().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const t = new Date(date + "T12:00:00Z").getTime() + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

export function prevMonth(month: string): string {
  return addDays(monthStart(month), -1).slice(0, 7);
}

export function monthLabel(month: string): string {
  return new Date(month + "-01T12:00:00Z").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function weekdayShort(date: string): string {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

/** Minutes between two "YYYY-MM-DD HH:mm" London stamps (b − a). */
export function minutesBetween(a: string, b: string): number {
  const toMs = (s: string) => new Date(s.replace(" ", "T") + ":00Z").getTime();
  return Math.round((toMs(b) - toMs(a)) / 60000);
}
