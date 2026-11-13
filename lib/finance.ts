// Finance view: revenue, rates, channels, areas, properties, forward bookings.
// Two ways to count revenue:
//   "stay"    — earned: a booking's total spread evenly over its nights (accrual).
//   "booking" — sold: the whole total on the day it was booked.
import type { Reservation, Unit } from "./boardTypes";
import { addDays, daysInMonth, londonStamp, londonToday, monthLabel } from "./dates";
import { loadRaw } from "./board";
import { isDemo } from "./hostaway";

export type Basis = "stay" | "booking";
export type Period = "month" | "year";

/** Keapr's management fee as a % of revenue after channel commission. Set MANAGEMENT_FEE_PCT to show it. */
const FEE_PCT = Number(process.env.MANAGEMENT_FEE_PCT || 0);

export interface FinanceTotals {
  revenue: number;
  nights: number;
  availableNights: number;
  occupancyPct: number;
  adr: number;
  revpar: number;
  bookings: number;
  avgBookingValue: number;
  avgStay: number;
  avgLeadDays: number;
  commission: number | null; // null when Hostaway gives no commission data
  cleaning: number | null;
  net: number | null;
  keaprFee: number | null;
  cancelledCount: number;
  cancelledValue: number;
}

export interface Finance {
  demo: boolean;
  generatedAt: string;
  today: string;
  period: Period;
  key: string; // YYYY-MM or YYYY
  label: string;
  basis: Basis;
  group: string;
  groups: string[];
  groupSizes: Record<string, number>;
  feePct: number;
  /** True if the period reaches into the future (stay basis counts nights already booked). */
  includesFuture: boolean;
  totals: FinanceTotals;
  previous: { label: string; totals: FinanceTotals };
  /** Month view: the 12 months up to it. Year view: that year's months. Plus the same month a year earlier. */
  monthly: Array<{ month: string; revenue: number; lastYear: number | null; nights: number; occupancyPct: number; adr: number }>;
  /** Daily revenue for a month view. */
  daily: Array<{ date: string; revenue: number }>;
  channels: Array<{ name: string; revenue: number; bookings: number; commission: number | null }>;
  areas: Array<{ name: string; revenue: number; nights: number; units: number; occupancyPct: number; adr: number }>;
  properties: Array<{ id: number; name: string; area: string; revenue: number; nights: number; occupancyPct: number; adr: number }>;
  /** Stay revenue already on the books: rest of this month, then the next five months. */
  forward: Array<{ month: string; revenue: number; occupancyPct: number }>;
}

const nightsBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000);

/** Revenue, nights and fees from one booking that fall inside [start, end] (inclusive dates). */
function share(r: Reservation, start: string, end: string, basis: Basis) {
  const total = Math.max(1, nightsBetween(r.arrival, r.departure));
  if (basis === "booking") {
    const d = r.bookedOn.slice(0, 10);
    const inside = d >= start && d <= end;
    const f = inside ? 1 : 0;
    return { f, nights: inside ? total : 0 };
  }
  const a = r.arrival > start ? r.arrival : start;
  const endEx = addDays(end, 1);
  const b = r.departure < endEx ? r.departure : endEx;
  const nights = Math.max(0, nightsBetween(a, b));
  return { f: nights / total, nights };
}

function availableNights(units: Unit[], start: string, end: string): number {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) n += units.filter((u) => u.onboardedAt <= d).length;
  return n;
}

function totalsFor(res: Reservation[], allRes: Reservation[], units: Unit[], start: string, end: string, basis: Basis): FinanceTotals {
  let revenue = 0, nights = 0, commission = 0, cleaning = 0, hasComm = false, hasClean = false;
  let lead = 0, stay = 0, count = 0, value = 0;
  for (const r of res) {
    const { f, nights: n } = share(r, start, end, basis);
    if (f <= 0) continue;
    revenue += r.total * f;
    nights += n;
    if (r.commission !== undefined) { commission += r.commission * f; hasComm = true; }
    if (r.cleaningFee !== undefined) { cleaning += r.cleaningFee * f; hasClean = true; }
    count += 1;
    value += r.total;
    stay += Math.max(1, nightsBetween(r.arrival, r.departure));
    lead += Math.max(0, nightsBetween(r.bookedOn.slice(0, 10), r.arrival));
  }
  // On stay basis, "nights" are nights in the period; on booking basis they're nights sold.
  const stayNights = basis === "stay" ? nights : res.reduce((s, r) => s + share(r, start, end, "stay").nights, 0);
  const stayRevenue = basis === "stay" ? revenue : res.reduce((s, r) => s + r.total * share(r, start, end, "stay").f, 0);
  const avail = availableNights(units, start, end);
  const cancelled = allRes.filter((r) => r.status === "cancelled" && r.cancelledOn && r.cancelledOn >= start && r.cancelledOn <= end);
  const net = hasComm ? revenue - commission : null;
  return {
    revenue: Math.round(revenue),
    nights,
    availableNights: avail,
    occupancyPct: avail ? Math.round((stayNights / avail) * 100) : 0,
    adr: stayNights ? Math.round(stayRevenue / stayNights) : 0,
    revpar: avail ? Math.round(stayRevenue / avail) : 0,
    bookings: count,
    avgBookingValue: count ? Math.round(value / count) : 0,
    avgStay: count ? Math.round((stay / count) * 10) / 10 : 0,
    avgLeadDays: count ? Math.round(lead / count) : 0,
    commission: hasComm ? Math.round(commission) : null,
    cleaning: hasClean ? Math.round(cleaning) : null,
    net: net === null ? null : Math.round(net),
    keaprFee: FEE_PCT > 0 ? Math.round((net ?? revenue) * (FEE_PCT / 100)) : null,
    cancelledCount: cancelled.length,
    cancelledValue: Math.round(cancelled.reduce((s, r) => s + r.total, 0)),
  };
}

function monthsBack(endMonth: string, n: number): string[] {
  const [y, m] = endMonth.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)).toISOString().slice(0, 7));
}
const mEnd = (m: string) => `${m}-${String(daysInMonth(m)).padStart(2, "0")}`;
const lastYear = (m: string) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;

export async function getFinance(opts: { period?: string; key?: string; basis?: string; group?: string }): Promise<Finance> {
  const today = londonToday();
  const thisMonth = today.slice(0, 7);
  const period: Period = opts.period === "year" ? "year" : "month";
  const basis: Basis = opts.basis === "booking" ? "booking" : "stay";
  let key = opts.key ?? (period === "year" ? today.slice(0, 4) : thisMonth);
  if (period === "month" && (!/^\d{4}-\d{2}$/.test(key) || key > thisMonth)) key = thisMonth;
  if (period === "year" && (!/^\d{4}$/.test(key) || key > today.slice(0, 4))) key = today.slice(0, 4);

  const start = period === "year" ? `${key}-01-01` : `${key}-01`;
  const end = period === "year" ? `${key}-12-31` : mEnd(key);
  // Booking basis can't run past today; stay basis keeps future nights already booked.
  const periodEnd = basis === "booking" && end > today ? today : end;

  // Enough history for 12 months back plus the same months last year.
  const fromDate = addDays(`${Number(start.slice(0, 4)) - 2}-01-01`, 0);
  const raw = await loadRaw(fromDate < addDays(today, -800) ? addDays(today, -800) : fromDate);

  const groups = Array.from(new Set(raw.units.map((u) => u.group))).sort();
  const group = opts.group && groups.includes(opts.group) ? opts.group : "All";
  const units = group === "All" ? raw.units : raw.units.filter((u) => u.group === group);
  const ids = new Set(units.map((u) => u.id));
  const allRes = raw.reservations.filter((r) => ids.has(r.listingId));
  const res = allRes.filter((r) => r.status === "confirmed");

  const totals = totalsFor(res, allRes, units, start, periodEnd, basis);

  // Previous period, same length: last month, or last year to the same day.
  let pStart: string, pEnd: string, pLabel: string;
  if (period === "month") {
    const pm = monthsBack(key, 2)[0];
    pStart = `${pm}-01`;
    const sameDay = Math.min(Number(periodEnd.slice(8, 10)), daysInMonth(pm));
    pEnd = periodEnd < end ? `${pm}-${String(sameDay).padStart(2, "0")}` : mEnd(pm);
    pLabel = periodEnd < end ? `${monthLabel(pm)} to the same day` : monthLabel(pm);
  } else {
    const py = String(Number(key) - 1);
    pStart = `${py}-01-01`;
    pEnd = periodEnd < end ? `${py}${periodEnd.slice(4)}` : `${py}-12-31`;
    pLabel = periodEnd < end ? `${py} to the same day` : py;
  }
  const previous = { label: pLabel, totals: totalsFor(res, allRes, units, pStart, pEnd, basis) };

  // Monthly trend.
  const trendMonths =
    period === "year"
      ? Array.from({ length: 12 }, (_, i) => `${key}-${String(i + 1).padStart(2, "0")}`).filter((m) => basis === "stay" || m <= thisMonth)
      : monthsBack(key, 12);
  const earliest = raw.reservations.reduce((m, r) => (r.arrival < m ? r.arrival : m), today);
  const monthly = trendMonths.map((m) => {
    const s = `${m}-01`;
    const e = basis === "booking" && mEnd(m) > today ? today : mEnd(m);
    const t = totalsFor(res, allRes, units, s, e, basis);
    const ly = lastYear(m);
    const lyHas = `${ly}-01` >= earliest.slice(0, 7) + "-01";
    return {
      month: m,
      revenue: t.revenue,
      lastYear: lyHas ? totalsFor(res, allRes, units, `${ly}-01`, mEnd(ly), basis).revenue : null,
      nights: t.nights,
      occupancyPct: t.occupancyPct,
      adr: t.adr,
    };
  });

  // Daily (month view).
  const daily: Finance["daily"] = [];
  if (period === "month") {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (basis === "booking" && d > today) break;
      let rev = 0;
      for (const r of res) rev += r.total * share(r, d, d, basis).f;
      daily.push({ date: d, revenue: Math.round(rev) });
    }
  }

  // Channels.
  const ch = new Map<string, { revenue: number; bookings: number; commission: number; has: boolean }>();
  for (const r of res) {
    const { f } = share(r, start, periodEnd, basis);
    if (f <= 0) continue;
    const name = r.channel || "Other";
    const c = ch.get(name) ?? { revenue: 0, bookings: 0, commission: 0, has: false };
    c.revenue += r.total * f;
    c.bookings += 1;
    if (r.commission !== undefined) { c.commission += r.commission * f; c.has = true; }
    ch.set(name, c);
  }
  const channels = Array.from(ch.entries())
    .map(([name, c]) => ({ name, revenue: Math.round(c.revenue), bookings: c.bookings, commission: c.has ? Math.round(c.commission) : null }))
    .sort((a, b) => b.revenue - a.revenue);

  // Areas and properties (stay figures for occupancy / ADR).
  const perUnit = new Map<number, { revenue: number; nights: number; stayRev: number }>();
  for (const r of res) {
    const s = share(r, start, periodEnd, basis);
    const st = share(r, start, periodEnd, "stay");
    if (s.f <= 0 && st.f <= 0) continue;
    const p = perUnit.get(r.listingId) ?? { revenue: 0, nights: 0, stayRev: 0 };
    p.revenue += r.total * s.f;
    p.nights += st.nights;
    p.stayRev += r.total * st.f;
    perUnit.set(r.listingId, p);
  }
  const occEnd = periodEnd;
  const properties = units
    .map((u) => {
      const p = perUnit.get(u.id) ?? { revenue: 0, nights: 0, stayRev: 0 };
      const avail = availableNights([u], start, occEnd);
      return {
        id: u.id,
        name: u.name,
        area: u.group,
        revenue: Math.round(p.revenue),
        nights: p.nights,
        occupancyPct: avail ? Math.round((p.nights / avail) * 100) : 0,
        adr: p.nights ? Math.round(p.stayRev / p.nights) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const areaMap = new Map<string, { revenue: number; nights: number; stayRev: number; units: number; avail: number }>();
  for (const u of units) {
    const p = perUnit.get(u.id) ?? { revenue: 0, nights: 0, stayRev: 0 };
    const a = areaMap.get(u.group) ?? { revenue: 0, nights: 0, stayRev: 0, units: 0, avail: 0 };
    a.revenue += p.revenue;
    a.nights += p.nights;
    a.stayRev += p.stayRev;
    a.units += 1;
    a.avail += availableNights([u], start, occEnd);
    areaMap.set(u.group, a);
  }
  const areas = Array.from(areaMap.entries())
    .map(([name, a]) => ({
      name,
      revenue: Math.round(a.revenue),
      nights: a.nights,
      units: a.units,
      occupancyPct: a.avail ? Math.round((a.nights / a.avail) * 100) : 0,
      adr: a.nights ? Math.round(a.stayRev / a.nights) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Forward: stay revenue already booked from this month on.
  const [ty, tm] = thisMonth.split("-").map(Number);
  const forward = Array.from({ length: 6 }, (_, i) => {
    const mo = new Date(Date.UTC(ty, tm - 1 + i, 1)).toISOString().slice(0, 7);
    // This month counts from tonight onwards; later months in full.
    const t = totalsFor(res, allRes, units, i === 0 ? today : `${mo}-01`, mEnd(mo), "stay");
    return { month: mo, revenue: t.revenue, occupancyPct: t.occupancyPct };
  });

  return {
    demo: isDemo(),
    generatedAt: londonStamp(),
    today,
    period,
    key,
    label: period === "year" ? key : monthLabel(key),
    basis,
    group,
    groups,
    groupSizes: Object.fromEntries(groups.map((g) => [g, raw.units.filter((u) => u.group === g).length])),
    feePct: FEE_PCT,
    includesFuture: basis === "stay" && end > today,
    totals,
    previous,
    monthly,
    daily,
    channels,
    areas,
    properties,
    forward,
  };
}
