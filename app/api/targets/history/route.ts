import { NextRequest, NextResponse } from "next/server";
import { getPersonHistory } from "@/lib/sheets";
import { personHistory, targetsConfigured } from "@/lib/boardTargets";
import { londonToday } from "@/lib/dates";

export const runtime = "nodejs";
// Not cached at Vercel's edge: targets are edited on the board, and edits must show straight away.
// (The Hostaway snapshot behind it is already held in memory, so this stays quick.)
const EDGE_CACHE = { "Cache-Control": "private, no-store" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("month");
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : londonToday().slice(0, 7);
  try {
    let history;
    try {
      history = targetsConfigured() ? await personHistory(month, 6) : await getPersonHistory(month, 6);
    } catch {
      history = await getPersonHistory(month, 6); // dashboard targets not set up yet
    }
    return NextResponse.json({ month, history }, { headers: EDGE_CACHE });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
