import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { countdown, leaderboard } from "@/lib/portal/stats";
import { currentMonth, isMonth, monthBounds, shiftMonth } from "@/lib/portal/period";
import { OFFER_COLUMNS } from "@/lib/portal/offers";

export const dynamic = "force-dynamic";

// Everything the portal screen needs: my countdown, my offers for a month, and the leaderboard.
export async function GET(req: Request) {
  const auth = await requireMember();
  if ("res" in auth) return auth.res;
  const { me } = auth;
  const url = new URL(req.url);
  const now = currentMonth();
  const month = isMonth(url.searchParams.get("month")) ? url.searchParams.get("month")! : now;
  const lb = url.searchParams.get("lb");
  const lbMonth = lb === "all" ? null : lb === "last" ? shiftMonth(now, -1) : now;

  try {
    const db = createAdminClient();
    const b = monthBounds(month);
    const [cd, board, offers] = await Promise.all([
      countdown(db, me, now),
      leaderboard(db, lbMonth),
      db.from("offers").select(OFFER_COLUMNS).eq("user_id", me.id).gte("sent_at", b.from).lt("sent_at", b.to)
        .order("sent_at", { ascending: false }).limit(1000),
    ]);
    if (offers.error) throw new Error(offers.error.message);
    return NextResponse.json({ me, month, countdown: cd, offers: offers.data, leaderboard: board, lb: lb === "all" || lb === "last" ? lb : "month" });
  } catch (e) {
    console.error("[portal/me]", e);
    return NextResponse.json({ error: "Couldn't load your offers. Has the database script been run?" }, { status: 500 });
  }
}
