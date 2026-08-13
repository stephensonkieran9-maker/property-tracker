import type { DashboardData, Listing, OnboardEvent } from "./types";
import { fetchAllListings, isDemo } from "./hostaway";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add `days` to a YYYY-MM-DD string (UTC), returning YYYY-MM-DD. */
function addDays(date: string, days: number): string {
  const t = new Date(date + "T00:00:00Z").getTime() + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Build a cumulative daily count series from first onboarding → today. */
function buildHistory(dates: string[], today: string): Array<{ date: string; count: number }> {
  if (dates.length === 0) return [{ date: today, count: 0 }];
  const sorted = [...dates].sort();
  const start = sorted[0];

  // Count onboardings per day, then walk day-by-day accumulating.
  const perDay = new Map<string, number>();
  for (const d of sorted) perDay.set(d, (perDay.get(d) ?? 0) + 1);

  const series: Array<{ date: string; count: number }> = [];
  let running = 0;
  let cursor = start;
  // Guard against runaway loops (~5 years of days).
  for (let i = 0; i < 2000 && cursor <= today; i++) {
    running += perDay.get(cursor) ?? 0;
    series.push({ date: cursor, count: running });
    cursor = addDays(cursor, 1);
  }
  // Ensure the final point is today with the full count.
  if (series.length === 0 || series[series.length - 1].date !== today) {
    series.push({ date: today, count: dates.length });
  }
  return series;
}

export async function getDashboardData(): Promise<DashboardData> {
  const listings: Listing[] = await fetchAllListings();
  const today = todayStr();
  const month = today.slice(0, 7);

  // Previous calendar month (e.g. today 2026-08 → "2026-07").
  const prevMonthDate = addDays(month + "-01", -1);
  const prevMonth = prevMonthDate.slice(0, 7);
  const thirtyDaysAgo = addDays(today, -30);

  const dated = listings.filter((l) => l.onboardedAt);
  const dates = dated.map((l) => l.onboardedAt);

  const onboardings: OnboardEvent[] = [...dated]
    .sort((a, b) => b.onboardedAt.localeCompare(a.onboardedAt))
    .map((l) => ({ date: l.onboardedAt, id: l.id, name: l.name, city: l.city }));

  const stats = {
    total: listings.length,
    thisMonth: dates.filter((d) => d.startsWith(month)).length,
    prevMonth: dates.filter((d) => d.startsWith(prevMonth)).length,
    last30: dates.filter((d) => d >= thirtyDaysAgo).length,
    sinceFirst: dates.length ? [...dates].sort()[0] : null,
  };

  return {
    current: { count: listings.length, listings },
    history: buildHistory(dates, today),
    onboardings,
    stats,
    demo: isDemo(),
    generatedAt: new Date().toISOString(),
  };
}
