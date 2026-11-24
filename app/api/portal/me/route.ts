import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { countdowns, leaderboard } from "@/lib/portal/stats";
import { currentMonth, isMonth, isPeriod, monthBounds, periodBounds, shiftMonth, type Period } from "@/lib/portal/period";
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
  const period: Period = isPeriod(url.searchParams.get("period")) ? (url.searchParams.get("period") as Period) : "month";
  const lbRaw = url.searchParams.get("lb");
  const lb = lbRaw === "day" || lbRaw === "week" || lbRaw === "last" || lbRaw === "all" ? lbRaw : "month";
  const lbBounds = lb === "all" ? null : lb === "last" ? monthBounds(shiftMonth(now, -1)) : periodBounds(lb, now);

  try {
    const db = createAdminClient();
    const b = periodBounds(period, month);
    let mine = db.from("offers").select(OFFER_COLUMNS).eq("user_id", me.id);
    if (b) mine = mine.gte("sent_at", b.from).lt("sent_at", b.to);
    const [cd, board, offers] = await Promise.all([
      countdowns(db, me, now),
      leaderboard(db, lbBounds),
      mine.order("sent_at", { ascending: false }).limit(1000),
    ]);
    if (offers.error) throw new Error(offers.error.message);
    return NextResponse.json({ me, month, countdowns: cd, period, offers: offers.data, leaderboard: board, lb });
  } catch (e) {
    console.error("[portal/me]", e);
    return NextResponse.json({ error: "Couldn't load your offers. Has the database script been run?" }, { status: 500 });
  }
}
