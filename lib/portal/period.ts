// Months follow UK time, so an offer sent at 00:30 on the 1st counts in the new month.

const TZ = "Europe/London";

/** Current month in UK time, as YYYY-MM. */
export function currentMonth(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7);
}

export function isMonth(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function shiftMonth(m: string, by: number): string {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm - 1 + by, 1)).toISOString().slice(0, 7);
}

/** The UTC instant of midnight UK time on the 1st of the month. */
function ukMonthStart(m: string): Date {
  const [y, mm] = m.split("-").map(Number);
  const guess = new Date(Date.UTC(y, mm - 1, 1));
  // UK is UTC or UTC+1; find the offset at that moment and subtract it.
  const ukHour = Number(guess.toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }));
  return new Date(guess.getTime() - (ukHour === 0 ? 0 : ukHour) * 3600_000);
}

export function monthBounds(m: string): { from: string; to: string } {
  return { from: ukMonthStart(m).toISOString(), to: ukMonthStart(shiftMonth(m, 1)).toISOString() };
}

/** Weekdays left in the month in UK time, counting today. At least 1. */
export function workdaysLeft(m: string, now = new Date()): number {
  const today = now.toLocaleDateString("en-CA", { timeZone: TZ });
  if (today.slice(0, 7) !== m) return today.slice(0, 7) < m ? workdaysIn(m, 1) : 0;
  return Math.max(1, workdaysIn(m, Number(today.slice(8, 10))));
}

function workdaysIn(m: string, fromDay: number): number {
  const [y, mm] = m.split("-").map(Number);
  const days = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  let n = 0;
  for (let d = fromDay; d <= days; d++) {
    const wd = new Date(Date.UTC(y, mm - 1, d)).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

export function monthLabel(m: string): string {
  return new Date(m + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
