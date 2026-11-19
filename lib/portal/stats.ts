import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentMonth, monthBounds, workdaysLeft } from "./period";
import { EMPTY_TOTALS, type Countdown, type LeaderRow, type Me, type Totals } from "./types";

type Db = ReturnType<typeof createAdminClient>;

interface TotalsRow {
  user_id: string;
  sent: number | string;
  won: number | string;
  lost: number | string;
  pending: number | string;
  sent_value: number | string;
  won_value: number | string;
  won_commission: number | string;
}

/** Per-person totals for a month (YYYY-MM) or all time (null). */
export async function totalsByUser(db: Db, month: string | null): Promise<Map<string, Totals>> {
  const b = month ? monthBounds(month) : null;
  const { data, error } = await db.rpc("portal_offer_totals", { p_from: b?.from ?? null, p_to: b?.to ?? null });
  if (error) throw new Error(`Couldn't load totals: ${error.message}`);
  const out = new Map<string, Totals>();
  for (const r of (data ?? []) as TotalsRow[]) {
    out.set(r.user_id, {
      sent: Number(r.sent),
      won: Number(r.won),
      lost: Number(r.lost),
      pending: Number(r.pending),
      sentValue: Number(r.sent_value),
      wonValue: Number(r.won_value),
      wonCommission: Number(r.won_commission),
    });
  }
  return out;
}

export function sumTotals(list: Iterable<Totals>): Totals {
  const t = { ...EMPTY_TOTALS };
  for (const x of list) {
    t.sent += x.sent;
    t.won += x.won;
    t.lost += x.lost;
    t.pending += x.pending;
    t.sentValue += x.sentValue;
    t.wonValue += x.wonValue;
    t.wonCommission += x.wonCommission;
  }
  return t;
}

const winRate = (t: Totals) => (t.won + t.lost > 0 ? t.won / (t.won + t.lost) : null);

/** Names for everyone who is a portal member or has ever sent an offer. */
export async function peopleNames(db: Db, ids: string[]): Promise<Map<string, { name: string; role: string | null; active: boolean }>> {
  const out = new Map<string, { name: string; role: string | null; active: boolean }>();
  const { data: members } = await db.from("portal_members").select("user_id, role, is_active, profiles!inner(full_name)");
  for (const m of members ?? []) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    out.set(m.user_id, { name: p?.full_name ?? "Unknown", role: m.role, active: m.is_active });
  }
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length) {
    const { data: profs } = await db.from("profiles").select("id, full_name").in("id", missing);
    for (const p of profs ?? []) out.set(p.id, { name: p.full_name, role: null, active: false });
  }
  return out;
}

/** Ranked by booking value won, then offers won. Shows active staff even with nothing yet. */
export async function leaderboard(db: Db, month: string | null): Promise<LeaderRow[]> {
  const totals = await totalsByUser(db, month);
  const names = await peopleNames(db, [...totals.keys()]);
  const ids = new Set<string>(totals.keys());
  names.forEach((v, id) => {
    if (v.active && v.role === "staff") ids.add(id);
  });
  const rows: LeaderRow[] = [...ids].map((id) => {
    const t = totals.get(id) ?? EMPTY_TOTALS;
    return { userId: id, name: names.get(id)?.name ?? "Unknown", ...t, winRate: winRate(t) };
  });
  return rows.sort((a, b) => b.wonValue - a.wonValue || b.won - a.won || b.sent - a.sent || a.name.localeCompare(b.name));
}

const MIN_DECIDED = 5; // outcomes needed before a win rate is trusted

/**
 * "At your current win rate, you need X more offers to hit your target."
 * Value per offer = booking value won ÷ offers with an outcome (won or lost).
 * Uses this month if there are 5+ outcomes, otherwise the person's all-time
 * record, otherwise the whole team's.
 */
export async function countdown(db: Db, me: Me, month = currentMonth()): Promise<Countdown> {
  const [monthTotals, allTotals] = await Promise.all([totalsByUser(db, month), totalsByUser(db, null)]);
  const mine = monthTotals.get(me.id) ?? EMPTY_TOTALS;
  const mineAll = allTotals.get(me.id) ?? EMPTY_TOTALS;
  const team = sumTotals(allTotals.values());

  const decided = (t: Totals) => t.won + t.lost;
  let basis: Countdown["basis"] = null;
  let src: Totals | null = null;
  if (decided(mine) >= MIN_DECIDED && mine.won > 0) [basis, src] = ["month", mine];
  else if (decided(mineAll) >= MIN_DECIDED && mineAll.won > 0) [basis, src] = ["all-time", mineAll];
  else if (decided(team) >= MIN_DECIDED && team.won > 0) [basis, src] = ["team", team];

  const valuePerOffer = src ? src.wonValue / decided(src) : null;
  const remaining = Math.max(0, me.monthlyTarget - mine.wonValue);
  const left = workdaysLeft(month);
  const offersNeeded = valuePerOffer && me.monthlyTarget > 0 ? Math.ceil(remaining / valuePerOffer) : null;

  return {
    target: me.monthlyTarget,
    wonValue: mine.wonValue,
    remaining,
    offersNeeded,
    perDay: offersNeeded !== null && left > 0 ? Math.ceil(offersNeeded / left) : null,
    workdaysLeft: left,
    valuePerOffer,
    basis,
    sent: mine.sent,
    won: mine.won,
    winRate: winRate(mine),
    oneIn: mine.won > 0 ? Math.round((mine.sent / mine.won) * 10) / 10 : null,
  };
}
