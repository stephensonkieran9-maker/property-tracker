import "server-only";
import type { Reservation } from "./boardTypes";
import { addDays } from "./dates";
import { isDemo } from "./hostaway";
import { HOSTAWAY_PLATFORM_COMMISSION } from "./targets";
import { targetsConfigured } from "./boardTargets";
import { createAdminClient } from "@/lib/supabase/admin";
import { ukMidnight } from "@/lib/portal/period";

// Keapr Revenue Combined, shared by the board and the Finance page.
//   Hostaway bookings that didn't come from an offer, less 12% platform commission
// + Offers won: managed (their Hostaway booking, in full: no commission) and arbitraged (not in Hostaway).
// Won managed offers are matched to their Hostaway reservation (property + check-in), so nothing is counted twice.
// Hostaway bookings count by booking date; arbitraged offers by the date the offer was sent.

export interface CombinedPart {
  hostawayGross: number;
  hostawayNet: number;
  managedOffers: number;
  managedOffersCount: number;
  arbitraged: number;
  arbitragedCount: number;
  /** Arbitraged wins with no "worth to Keapr" yet (booking value less platform commission used). */
  estimated: number;
  offersWon: number;
  offersWonCount: number;
  total: number;
}

export interface OfferContext {
  available: boolean;
  error?: string;
  /** Hostaway reservation ids that came from won managed offers. */
  fromOffers: Set<number>;
  managedUnmatched: number;
  arbitraged: Array<{ sentAt: string; worth: number; estimated: boolean }>;
}

/** Loads the offers needed for any period from `fromDay` (YYYY-MM-DD) on, and matches managed offers to Hostaway. */
export async function loadOfferContext(reservations: Reservation[], fromDay: string): Promise<OfferContext> {
  const empty: OfferContext = { available: false, fromOffers: new Set(), managedUnmatched: 0, arbitraged: [] };
  if (isDemo()) return { ...empty, error: "Demo data" };
  if (!targetsConfigured()) return { ...empty, error: "Offers database not connected" };
  try {
    const db = createAdminClient();
    const [managed, arb] = await Promise.all([
      db.from("offers").select("hostaway_listing_id, check_in, check_out")
        .eq("outcome", "won").eq("model", "managed")
        .not("hostaway_listing_id", "is", null).not("check_in", "is", null)
        .gte("check_in", addDays(fromDay, -400)).limit(20000),
      db.from("offers").select("worth_to_keapr, booking_value, commission_value, sent_at")
        .eq("outcome", "won").eq("model", "arbitraged")
        .gte("sent_at", ukMidnight(fromDay).toISOString()).limit(20000),
    ]);
    if (managed.error) throw new Error(managed.error.message);
    if (arb.error) throw new Error(arb.error.message);

    const byKey = new Map<string, Reservation[]>();
    for (const r of reservations) {
      if (r.status !== "confirmed") continue;
      const k = `${r.listingId}|${r.arrival}`;
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(r);
    }
    const fromOffers = new Set<number>();
    let unmatched = 0;
    for (const o of managed.data ?? []) {
      const cands = (byKey.get(`${Number(o.hostaway_listing_id)}|${o.check_in}`) ?? []).filter((r) => !fromOffers.has(r.id));
      const hit = cands.find((r) => !o.check_out || r.departure === o.check_out) ?? cands[0];
      if (hit) fromOffers.add(hit.id);
      else unmatched++;
    }
    const arbitraged = (arb.data ?? []).map((r) => ({
      sentAt: String(r.sent_at),
      worth: r.worth_to_keapr !== null ? Number(r.worth_to_keapr) || 0 : (Number(r.booking_value) || 0) - (Number(r.commission_value) || 0),
      estimated: r.worth_to_keapr === null,
    }));
    return { available: true, fromOffers, managedUnmatched: unmatched, arbitraged };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Offers not available" };
  }
}

/** Keapr Revenue Combined for bookings made between two days (inclusive, UK dates). `reservations` = whole portfolio. */
export function combinedFor(ctx: OfferContext, reservations: Reservation[], start: string, end: string): CombinedPart {
  const keep = 1 - HOSTAWAY_PLATFORM_COMMISSION;
  let other = 0, offer = 0, n = 0;
  for (const r of reservations) {
    if (r.status !== "confirmed") continue;
    const d = r.bookedOn.slice(0, 10);
    if (d < start || d > end) continue;
    if (ctx.fromOffers.has(r.id)) { offer += r.total; n++; }
    else other += r.total;
  }
  const from = ukMidnight(start).toISOString();
  const to = ukMidnight(addDays(end, 1)).toISOString();
  let arb = 0, arbN = 0, est = 0;
  for (const a of ctx.arbitraged) {
    if (a.sentAt < from || a.sentAt >= to) continue;
    arb += a.worth;
    arbN++;
    if (a.estimated) est++;
  }
  const hostawayNet = Math.round(other * keep);
  const offersWon = Math.round(offer) + Math.round(arb);
  return {
    hostawayGross: Math.round(other),
    hostawayNet,
    managedOffers: Math.round(offer),
    managedOffersCount: n,
    arbitraged: Math.round(arb),
    arbitragedCount: arbN,
    estimated: est,
    offersWon,
    offersWonCount: n + arbN,
    total: hostawayNet + offersWon,
  };
}
