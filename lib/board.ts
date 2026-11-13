import type { Board, Conversation, Problem, ProblemKind, RawData, Reservation, TargetProgress, Unit } from "./boardTypes";
import { addDays, daysInMonth, londonStamp, londonToday, minutesBetween, monthEnd, monthLabel, monthStart, prevMonth, weekdayShort } from "./dates";
import { NIGHTLY_OCCUPANCY_TARGET, TEAM_TARGETS, targetFor } from "./targets";
import { isDemo, fetchAllListings } from "./hostaway";
import { fetchConversations, fetchReservations } from "./hostawayBoard";
import { recordAndDiffLosses } from "./store";
import { mockRawData } from "./mockBoard";
import { getPersonTargets } from "./sheets";

// ── Raw data (cached briefly so filter / month clicks don't re-hit Hostaway) ──

let cache: { key: string; at: number; data: RawData } | null = null;
const TTL = 3 * 60 * 1000;

export async function loadRaw(fromDate: string): Promise<RawData> {
  if (isDemo()) return mockRawData();
  const today = londonToday();
  const key = fromDate;
  if (cache && cache.key <= key && Date.now() - cache.at < TTL) return cache.data;

  const listings = await fetchAllListings();
  const units: Unit[] = listings.map((l) => ({
    id: l.id,
    name: l.name,
    group: l.city?.trim() || "Other",
    onboardedAt: l.onboardedAt,
  }));
  const [reservations, conversations, lossState] = await Promise.all([
    fetchReservations(fromDate, addDays(today, 400)),
    fetchConversations(addDays(today, -14) + " 00:00").catch(() => [] as Conversation[]),
    recordAndDiffLosses(listings, today).catch(() => ({ losses: [], trackingSince: null })),
  ]);
  const data: RawData = {
    units,
    reservations,
    conversations,
    losses: lossState.losses.map((l) => ({ date: l.date, id: l.id, name: l.name, group: l.city?.trim() || "Other" })),
  };
  cache = { key, at: Date.now(), data };
  return data;
}

// ── Inbox problem spotting ──────────────────────────────────

const RULES: Array<{ kind: ProblemKind; severity: 1 | 2 | 3; words: RegExp }> = [
  { kind: "Access", severity: 3, words: /locked out|stuck outside|can'?t get in|cannot get in|lock ?box|key ?safe|door code|code (isn'?t|is not|not) working|no access|keys?\b/i },
  { kind: "Maintenance", severity: 3, words: /leak|flood|no hot water|boiler|heating|no power|electric|broken|smoke alarm|gas/i },
  { kind: "Refund", severity: 2, words: /refund|money back|compensation|charged twice|overcharged|chargeback/i },
  { kind: "Complaint", severity: 2, words: /dirty|disgusting|unacceptable|disappointed|complain|review|filthy|not clean|smell/i },
  { kind: "Cancellation", severity: 2, words: /cancel/i },
  { kind: "Noise", severity: 2, words: /noise|noisy|loud|party|neighbou?rs/i },
  { kind: "WiFi", severity: 1, words: /wi-?fi|internet/i },
];

// Short sign-offs ("Thanks for your hosting", "Super! Merci!", "👍") don't need a reply.
const ACK = /\b(thanks?|thank ?you|thx|ty|cheers|merci|danke|gracias|grazie|obrigad[oa]|dank(je|e)|super|great|perfect|lovely|brilliant|awesome|amazing|wonderful|fantastic|excellent|ok(ay)?|noted|will do|sounds good|all good|no worries|appreciated?|bye|goodbye|have a (good|great|nice))\b|[👍🙏❤️😊🙂👌✅]/iu;
export function isAck(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.length > 120 || t.includes("?")) return false;
  // Questions without a question mark ("Thanks! What time is checkout").
  if (/\b(what|when|where|which|how|can|could|is there|are there|do you|does|will you|would you|please|need|help)\b/i.test(t)) return false;
  if (classify(t)) return false; // anything that reads like a problem still counts
  return ACK.test(t);
}

export function classify(text: string): { kind: ProblemKind; severity: 1 | 2 | 3 } | null {
  for (const r of RULES) if (r.words.test(text)) return { kind: r.kind, severity: r.severity };
  return null;
}

// ── Helpers ─────────────────────────────────────────────────

function occupiedOn(res: Reservation[], date: string): Set<number> {
  const s = new Set<number>();
  for (const r of res) if (r.status === "confirmed" && r.arrival <= date && date < r.departure) s.add(r.listingId);
  return s;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function pace(actual: number, target: number, expected: number, lowerIsBetter = false): TargetProgress["status"] {
  if (lowerIsBetter) return actual <= target ? "on-track" : "behind";
  if (expected <= 0) return "on-track";
  if (actual >= expected * 1.05) return "ahead";
  if (actual >= expected * 0.95) return "on-track";
  return "behind";
}

// ── Board ───────────────────────────────────────────────────

export async function getBoard(opts: { month?: string; group?: string }): Promise<Board> {
  const today = londonToday();
  const nowStamp = londonStamp();
  const currentMonth = today.slice(0, 7);
  let month = opts.month && /^\d{4}-\d{2}$/.test(opts.month) ? opts.month : currentMonth;
  if (month > currentMonth) month = currentMonth;
  const yearStart = `${month.slice(0, 4)}-01-01`;

  // Arrivals from ~4 months before the year starts catch bookings made in-year.
  const raw = await loadRaw(addDays(yearStart < `${currentMonth.slice(0, 4)}-01-01` ? yearStart : `${currentMonth.slice(0, 4)}-01-01`, -120));

  const groups = Array.from(new Set(raw.units.map((u) => u.group))).sort();
  const group = opts.group && groups.includes(opts.group) ? opts.group : "All";

  const units = group === "All" ? raw.units : raw.units.filter((u) => u.group === group);
  const unitIds = new Set(units.map((u) => u.id));
  const unitById = new Map(raw.units.map((u) => [u.id, u]));
  const res = raw.reservations.filter((r) => unitIds.has(r.listingId));
  const confirmed = res.filter((r) => r.status === "confirmed");
  const convs =
    group === "All" ? raw.conversations : raw.conversations.filter((c) => c.listingId && unitIds.has(c.listingId));

  // ── Tonight
  const occTonight = occupiedOn(res, today);
  const lastWeek = addDays(today, -7);
  const occLastWeek = occupiedOn(res, lastWeek);
  const unitsLastWeek = units.filter((u) => u.onboardedAt <= lastWeek).length;
  const arrivals = confirmed.filter((r) => r.arrival === today);
  const firstHour = arrivals.map((r) => r.checkInTime).filter((h): h is number => typeof h === "number").sort((a, b) => a - b)[0];

  const byGroup = groups
    .filter((g) => group === "All" || g === group)
    .map((g) => {
      const gu = raw.units.filter((u) => u.group === g);
      const ids = new Set(gu.map((u) => u.id));
      const occ = Array.from(occTonight).filter((id) => ids.has(id)).length;
      return { group: g, pct: pct(occ, gu.length), occupied: occ, units: gu.length };
    });

  // ── Today / last 24h bookings
  const bookedToday = confirmed.filter((r) => r.bookedOn.startsWith(today));
  const since24 = londonStamp(new Date(Date.now() - 24 * 3600 * 1000));
  const booked24 = confirmed.filter((r) => r.bookedOn >= since24);

  // ── Inbox
  const needsReply = (c: Conversation) =>
    !!c.lastIncomingAt && (!c.lastOutgoingAt || c.lastOutgoingAt < c.lastIncomingAt) && !isAck(c.lastMessage);
  const waiting = convs.filter(needsReply);
  const oldest = waiting.map((c) => c.lastIncomingAt!).sort()[0] ?? null;
  const problems: Problem[] = [];
  for (const c of convs) {
    if (!c.lastIncomingAt) continue;
    const unanswered = needsReply(c);
    const hit = classify(c.lastMessage);
    const waitingMins = minutesBetween(c.lastIncomingAt, nowStamp);
    // Flag anything that reads like a problem in the last 3 days, plus anything left > 4h.
    if ((hit && waitingMins < 72 * 60) || (unanswered && waitingMins > 240)) {
      problems.push({
        conversationId: c.id,
        kind: hit?.kind ?? "Unanswered",
        severity: hit ? (unanswered ? hit.severity : (Math.max(1, hit.severity - 1) as 1 | 2)) : 1,
        guestName: c.guestName,
        listingName: c.listingName,
        group: c.listingId ? unitById.get(c.listingId)?.group : undefined,
        message: c.lastMessage || "(no message text)",
        receivedAt: c.lastIncomingAt,
        unanswered,
        waitingMins,
      });
    }
  }
  problems.sort((a, b) => Number(b.unanswered) - Number(a.unanswered) || b.severity - a.severity || b.waitingMins - a.waitingMins);

  // ── Selected month
  const mStart = monthStart(month);
  const mEnd = monthEnd(month);
  const nDays = daysInMonth(month);
  const isCurrent = month === currentMonth;
  const inMonth = (s: string) => s.slice(0, 10) >= mStart && s.slice(0, 10) <= mEnd;
  const monthBookings = confirmed.filter((r) => inMonth(r.bookedOn));
  const monthCancelled = res.filter((r) => r.status === "cancelled" && r.cancelledOn && inMonth(r.cancelledOn));
  const monthRevenue = monthBookings.reduce((s, r) => s + r.total, 0);

  let nightsSold = 0;
  let stayRevenue = 0;
  let availableNights = 0;
  for (let i = 0; i < nDays; i++) {
    const d = addDays(mStart, i);
    availableNights += units.filter((u) => u.onboardedAt <= d).length;
  }
  for (const r of confirmed) {
    if (r.departure <= mStart || r.arrival > mEnd) continue;
    const nights = Math.max(1, Math.round((new Date(r.departure).getTime() - new Date(r.arrival).getTime()) / 86400000));
    const a = r.arrival > mStart ? r.arrival : mStart;
    const dEnd = r.departure < addDays(mEnd, 1) ? r.departure : addDays(mEnd, 1);
    const inside = Math.round((new Date(dEnd).getTime() - new Date(a).getTime()) / 86400000);
    if (inside <= 0) continue;
    nightsSold += inside;
    stayRevenue += (r.total * inside) / nights;
  }

  const ytdEnd = isCurrent ? today : mEnd;
  const runningTotal = confirmed
    .filter((r) => r.bookedOn.slice(0, 10) >= yearStart && r.bookedOn.slice(0, 10) <= ytdEnd)
    .reduce((s, r) => s + r.total, 0);

  const pm = prevMonth(month);
  // For the current month, compare against last month up to the same day so it's like-for-like.
  const pmCutoff = isCurrent ? `${pm}-${today.slice(8, 10)}` : `${pm}-31`;
  const prevMonthRevenue = confirmed
    .filter((r) => r.bookedOn.startsWith(pm) && r.bookedOn.slice(0, 10) <= pmCutoff)
    .reduce((s, r) => s + r.total, 0);

  const daily: Board["month"]["daily"] = [];
  let cum = 0;
  for (let i = 0; i < nDays; i++) {
    const d = addDays(mStart, i);
    if (d > today) break;
    const day = monthBookings.filter((r) => r.bookedOn.startsWith(d));
    const rev = day.reduce((s, r) => s + r.total, 0);
    cum += rev;
    daily.push({ date: d, bookings: day.length, revenue: Math.round(rev), cumulative: Math.round(cum) });
  }

  // Nightly occupancy across the month, and the properties onboarded in it (for the Targets page).
  const nightly: Board["month"]["nightly"] = [];
  for (let i = 0; i < nDays; i++) {
    const d = addDays(mStart, i);
    const avail = units.filter((u) => u.onboardedAt <= d).length;
    nightly.push({ date: d, pct: pct(occupiedOn(res, d).size, avail), future: d > today });
  }
  const onboardedUnits = units
    .filter((u) => u.onboardedAt.startsWith(month))
    .sort((a, b) => b.onboardedAt.localeCompare(a.onboardedAt))
    .map((u) => ({ name: u.name, group: u.group, date: u.onboardedAt }));

  // ── Next 14 nights heatmap
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const occByDate = dates.map((d) => occupiedOn(raw.reservations, d));
  const rowFor = (label: string, us: Unit[], kind: Board["next14"]["rows"][number]["kind"]) => ({
    group: label,
    units: us.length,
    kind,
    pcts: occByDate.map((set) => pct(us.filter((u) => set.has(u.id)).length, us.length)),
  });
  // First row is the total. With "All": one row per area, biggest first.
  // With one area picked: one row per property in it (each cell is booked / empty).
  const rows =
    group === "All"
      ? [
          rowFor("All properties", raw.units, "total"),
          ...groups
            .map((g) => rowFor(g, raw.units.filter((u) => u.group === g), "area"))
            .sort((a, b) => b.units - a.units || a.group.localeCompare(b.group)),
        ]
      : [
          rowFor(`All in ${group}`, units, "total"),
          ...units
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((u) => rowFor(u.name, [u], "property")),
        ];

  // ── Portfolio + targets
  const onboardedThisMonth = units.filter((u) => u.onboardedAt.startsWith(month)).length;
  const lostThisMonth = raw.losses.filter((l) => l.date.startsWith(month) && (group === "All" || l.group === group)).length;
  const occupancyPct = pct(nightsSold, availableNights);
  const progress = isCurrent ? Number(today.slice(8, 10)) / nDays : 1;

  const actuals: Record<string, number> = {
    unitsOnboarded: onboardedThisMonth,
    bookedRevenue: Math.round(monthRevenue),
    bookings: monthBookings.length,
    occupancy: occupancyPct,
    unanswered: waiting.length,
  };
  const targets: TargetProgress[] = TEAM_TARGETS.map((t) => {
    const target = targetFor(t, month);
    const actual = actuals[t.metric] ?? 0;
    const cumulative = t.metric === "unitsOnboarded" || t.metric === "bookedRevenue" || t.metric === "bookings";
    const lower = t.metric === "unanswered";
    const expected = cumulative ? target * progress : target;
    return {
      team: t.team,
      label: t.label,
      actual,
      target,
      format: t.metric === "bookedRevenue" ? "gbp" : t.metric === "occupancy" ? "pct" : "int",
      lowerIsBetter: lower,
      pace: cumulative && isCurrent ? Math.round(expected) : null,
      status:
        t.metric === "occupancy"
          ? actual >= target ? "on-track" : actual >= target - 5 ? "on-track" : "behind"
          : pace(actual, target, expected, lower),
    };
  });
  const revenueTarget = targetFor(TEAM_TARGETS.find((t) => t.metric === "bookedRevenue")!, month);
  // Team targets are company-wide, so an area filter shouldn't change them.
  const companyTargets = group === "All" ? targets : (await getBoard({ month })).targets;

  const sheet = await getPersonTargets(month);
  const people: Board["people"] = {
    source: sheet.source,
    error: sheet.error,
    rows: sheet.people.map((p) => {
      const expected = p.unit === "pct" ? p.target : p.target * progress;
      return {
        person: p.person,
        team: p.team,
        target: p.target,
        actual: p.actual,
        format: p.unit,
        pace: isCurrent && p.unit !== "pct" ? Math.round(expected) : null,
        status: p.actual === null ? "pending" : pace(p.actual, p.target, expected),
      };
    }),
  };

  return {
    demo: isDemo(),
    generatedAt: nowStamp,
    today,
    greetingName: process.env.GREETING_NAME || "team",
    groups,
    groupSizes: Object.fromEntries(groups.map((g) => [g, raw.units.filter((u) => u.group === g).length])),
    group,
    tonight: {
      occupancyPct: pct(occTonight.size, units.length),
      occupied: occTonight.size,
      units: units.length,
      vsLastWeekPts: pct(occTonight.size, units.length) - pct(occLastWeek.size, unitsLastWeek),
      lastWeekDay: weekdayShort(lastWeek),
      arriving: arrivals.length,
      firstArrival: firstHour !== undefined ? `${String(firstHour).padStart(2, "0")}:00` : null,
      leaving: confirmed.filter((r) => r.departure === today).length,
      byGroup,
    },
    today_: {
      bookings: bookedToday.length,
      cancelled: res.filter((r) => r.status === "cancelled" && r.cancelledOn === today).length,
      revenue: Math.round(bookedToday.reduce((s, r) => s + r.total, 0)),
      last24hRevenue: Math.round(booked24.reduce((s, r) => s + r.total, 0)),
      last24hBookings: booked24.length,
    },
    inbox: { unanswered: waiting.length, oldestUnanswered: oldest, problems: problems.slice(0, 12) },
    month: {
      key: month,
      label: monthLabel(month),
      isCurrent,
      bookings: monthBookings.length,
      cancelled: monthCancelled.length,
      revenue: Math.round(monthRevenue),
      stayRevenue: Math.round(stayRevenue),
      nightsSold,
      occupancyPct,
      adr: nightsSold ? Math.round(stayRevenue / nightsSold) : 0,
      runningTotal: Math.round(runningTotal),
      runningTotalLabel: `${month.slice(0, 4)} to date`,
      prevMonthRevenue: Math.round(prevMonthRevenue),
      daily,
      nightly,
      onboardedUnits,
      daysInMonth: nDays,
      revenueTarget: group === "All" ? revenueTarget : 0,
    },
    next14: { dates, rows, target: NIGHTLY_OCCUPANCY_TARGET },
    portfolio: { units: units.length, onboardedThisMonth, lostThisMonth },
    targets: companyTargets,
    people,
  };
}
