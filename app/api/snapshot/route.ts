import { NextRequest, NextResponse } from "next/server";
import { isDemo } from "@/lib/hostaway";
import { getSnapshot } from "@/lib/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs daily via Vercel Cron (see vercel.json): pulls fresh data from Hostaway,
// records any lost properties, and saves the shared snapshot every page reads.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isDemo()) return NextResponse.json({ ok: true, demo: true });

  try {
    const s = await getSnapshot({ force: true });
    return NextResponse.json({
      ok: true,
      properties: s.listings.length,
      reservations: s.reservations.length,
      conversations: s.conversations.length,
      lossesTracked: s.losses.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
