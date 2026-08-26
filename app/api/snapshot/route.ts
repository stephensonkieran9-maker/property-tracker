import { NextRequest, NextResponse } from "next/server";
import { fetchAllListings } from "@/lib/hostaway";
import { recordAndDiffLosses } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runs daily via Vercel Cron (see vercel.json) to record a roster snapshot,
// so losses are detected with an accurate date even between visits.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const listings = await fetchAllListings();
    const today = new Date().toISOString().slice(0, 10);
    const { losses } = await recordAndDiffLosses(listings, today);
    return NextResponse.json({ ok: true, count: listings.length, lossesTracked: losses.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
