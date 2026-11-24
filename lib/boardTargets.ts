import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { monthBounds } from "@/lib/portal/period";
import { totalsByUser } from "@/lib/portal/stats";

// Targets set on the dashboard (table board_targets, see supabase/board_targets.sql).
// People linked to the offers portal use their offers for the actual, and their target
// is the one on their portal account, so the portal countdown and the board always agree.

export type TargetUnit = "gbp" | "int" | "pct";
export type TargetSource =
  | "manual"
  | "offers_value"
  | "offers_worth"
  | "unitsOnboarded"
  | "bookedRevenue"
  | "bookings"
  | "occupancy"
  | "unanswered"
  | "combinedRevenue";

export const HOSTAWAY_SOURCES: TargetSource[] = ["unitsOnboarded", "bookedRevenue", "bookings", "occupancy", "unanswered", "combinedRevenue"];
export const ALL_SOURCES: TargetSource[] = ["manual", "offers_value", "offers_worth", ...HOSTAWAY_SOURCES];
export const isOffers = (s: TargetSource) => s === "offers_value" || s === "offers_worth";

export interface TargetRow {
  id: string;
  kind: "person" | "company";
  label: string;
  team: string | null;
  unit: TargetUnit;
  source: TargetSource;
  userId: string | null;
  target: number;
  actuals: Record<string, number>;
  lowerIsBetter: boolean;
  sort: number;
}

/** Every active portal member, for the "link to offers" picker. */
export interface StaffOption {
  id: string;
  name: string;
  monthlyTarget: number;
  worthTarget: number;
}

export function targetsConfigured(): boolean {
  return isSupabaseConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

type Db = ReturnType<typeof createAdminClient>;

const toRow = (r: Record<string, unknown>): TargetRow => ({
  id: String(r.id),
  kind: r.kind === "company" ? "company" : "person",
  label: String(r.label ?? ""),
  team: (r.team as string | null) ?? null,
  unit: (["gbp", "int", "pct"].includes(String(r.unit)) ? r.unit : "gbp") as TargetUnit,
  source: (ALL_SOURCES.includes(r.source as TargetSource) ? r.source : "manual") as TargetSource,
  userId: (r.user_id as string | null) ?? null,
  target: Number(r.target) || 0,
  actuals: (r.actuals && typeof r.actuals === "object" ? r.actuals : {}) as Record<string, number>,
  lowerIsBetter: Boolean(r.lower_is_better),
  sort: Number(r.sort) || 0,
});

export async function staffOptions(db: Db = createAdminClient()): Promise<StaffOption[]> {
  const { data, error } = await db.from("portal_members").select("user_id, monthly_target, worth_target, is_active, profiles!inner(full_name)").eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((m) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return { id: m.user_id as string, name: (p?.full_name as string) ?? "Unknown", monthlyTarget: Number(m.monthly_target) || 0, worthTarget: Number(m.worth_target) || 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** All dashboard targets, with linked people's targets taken from their portal account. */
export async function loadTargets(db: Db = createAdminClient()): Promise<TargetRow[]> {
  const { data, error } = await db.from("board_targets").select("*").order("sort").order("created_at");
  if (error) {
    if (/board_targets/.test(error.message) && /does not exist|schema cache/i.test(error.message)) {
      throw new Error("Run supabase/board_targets.sql in the Supabase SQL Editor to manage targets here.");
    }
    throw new Error(error.message);
  }
  const rows = (data ?? []).map(toRow);
  if (rows.some((r) => isOffers(r.source) && r.userId)) {
    const staff = new Map((await staffOptions(db)).map((s) => [s.id, s]));
    for (const r of rows) {
      const s = r.userId ? staff.get(r.userId) : undefined;
      if (s && isOffers(r.source)) r.target = r.source === "offers_worth" ? s.worthTarget : s.monthlyTarget;
    }
  }
  return rows;
}

/** Actuals for offers-linked targets in a month: user id → { value, worth }. */
export async function offerActuals(month: string, db: Db = createAdminClient()): Promise<Map<string, { value: number; worth: number }>> {
  const totals = await totalsByUser(db, month);
  const out = new Map<string, { value: number; worth: number }>();
  totals.forEach((t, id) => out.set(id, { value: t.wonValue, worth: t.wonWorth }));
  return out;
}

/** The actual for one target in a month, given the Hostaway figures. Null = nothing entered yet. */
export function actualFor(
  r: TargetRow,
  month: string,
  hostaway: Partial<Record<TargetSource, number>>,
  offers: Map<string, { value: number; worth: number }>
): number | null {
  if (r.source === "manual") {
    const v = r.actuals[month];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  if (isOffers(r.source)) {
    if (!r.userId) return null;
    const o = offers.get(r.userId);
    return Math.round(r.source === "offers_worth" ? o?.worth ?? 0 : o?.value ?? 0);
  }
  return hostaway[r.source] ?? null;
}

/**
 * Arbitraged offers won: these never reach Hostaway, so they're added on top of
 * Hostaway revenue in Keapr Revenue Combined. Counts "worth to Keapr"; where staff haven't
 * added it yet, falls back to booking value less the platform's commission. By the date the offer was sent.
 */
export async function arbitragedWon(month: string, db: Db = createAdminClient()): Promise<{ month: number; monthCount: number; ytd: number; estimated: number }> {
  const year = month.slice(0, 4);
  const from = monthBounds(`${year}-01`).from;
  const to = monthBounds(month).to;
  const mb = monthBounds(month);
  const { data, error } = await db
    .from("offers")
    .select("worth_to_keapr, booking_value, commission_value, sent_at")
    .eq("outcome", "won")
    .eq("model", "arbitraged")
    .gte("sent_at", from)
    .lt("sent_at", to)
    .limit(20000);
  if (error) throw new Error(error.message);
  let m = 0, n = 0, ytd = 0, missing = 0;
  for (const r of data ?? []) {
    const w = r.worth_to_keapr !== null ? Number(r.worth_to_keapr) || 0 : (Number(r.booking_value) || 0) - (Number(r.commission_value) || 0);
    ytd += w;
    if (r.sent_at >= mb.from && r.sent_at < mb.to) {
      m += w;
      n++;
      if (r.worth_to_keapr === null) missing++;
    }
  }
  return { month: Math.round(m), monthCount: n, ytd: Math.round(ytd), estimated: missing };
}

/** The n months up to and including `month`, oldest first. */
export function monthsUpTo(month: string, n: number): string[] {
  const out: string[] = [];
  let [y, m] = month.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

/** Each person's target and actual for the n months up to `month`, keyed by their label. */
export async function personHistory(month: string, n = 6): Promise<Record<string, Array<{ month: string; target: number; actual: number | null }>>> {
  const db = createAdminClient();
  const rows = (await loadTargets(db)).filter((r) => r.kind === "person");
  const months = monthsUpTo(month, n);
  const linked = rows.some((r) => isOffers(r.source) && r.userId);
  const byMonth = linked ? await Promise.all(months.map((m) => offerActuals(m, db))) : months.map(() => new Map());
  const out: Record<string, Array<{ month: string; target: number; actual: number | null }>> = {};
  for (const r of rows) {
    out[r.label] = months.map((m, i) => ({ month: m, target: r.target, actual: actualFor(r, m, {}, byMonth[i]) }));
  }
  return out;
}

/** Won managed offers with a Hostaway property and check-in, for matching to Hostaway reservations. */
export async function managedWon(sinceCheckIn: string, db: Db = createAdminClient()): Promise<Array<{ listingId: number; checkIn: string; checkOut: string | null }>> {
  const { data, error } = await db
    .from("offers")
    .select("hostaway_listing_id, check_in, check_out")
    .eq("outcome", "won")
    .eq("model", "managed")
    .not("hostaway_listing_id", "is", null)
    .not("check_in", "is", null)
    .gte("check_in", sinceCheckIn)
    .limit(20000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ listingId: Number(r.hostaway_listing_id), checkIn: String(r.check_in), checkOut: r.check_out ? String(r.check_out) : null }));
}
