// ── Team targets ─────────────────────────────────────────────
// Edit these to match each team's real monthly targets.
// `monthly` is the default; add a month key to `overrides` to change one month.

export type TargetMetric =
  | "unitsOnboarded" // new properties brought into Hostaway this month
  | "bookedRevenue" // revenue booked this month (by booking date)
  | "bookings" // reservations made this month
  | "occupancy" // month occupancy %
  | "unanswered"; // guest messages waiting for a reply right now

export interface TeamTarget {
  team: string;
  label: string;
  metric: TargetMetric;
  monthly: number;
  overrides?: Record<string, number>; // "YYYY-MM" → value
}

export const TEAM_TARGETS: TeamTarget[] = [
  { team: "Growth", label: "New units onboarded", metric: "unitsOnboarded", monthly: 8 },
  { team: "Revenue", label: "Booked revenue", metric: "bookedRevenue", monthly: 150000 },
  { team: "Revenue", label: "Bookings made", metric: "bookings", monthly: 380 },
  { team: "Operations", label: "Month occupancy", metric: "occupancy", monthly: 80 },
  { team: "Guest experience", label: "Unanswered messages (max)", metric: "unanswered", monthly: 10 },
];

/** Occupancy % below which a night is flagged on the 14-night heatmap. */
export const NIGHTLY_OCCUPANCY_TARGET = 60;

export function targetFor(t: TeamTarget, month: string): number {
  return t.overrides?.[month] ?? t.monthly;
}
