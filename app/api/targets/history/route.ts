import { NextRequest, NextResponse } from "next/server";
import { getPersonHistory } from "@/lib/sheets";
import { londonToday } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("month");
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : londonToday().slice(0, 7);
  try {
    return NextResponse.json({ month, history: await getPersonHistory(month, 6) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
