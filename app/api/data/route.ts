import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard";

export const runtime = "nodejs";
// Vercel's edge answers repeat requests for 30s, then serves the last answer while it fetches a new one.
const EDGE_CACHE = { "Cache-Control": "s-maxage=30, stale-while-revalidate=600" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await getDashboardData();
    return NextResponse.json(data, { headers: EDGE_CACHE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
