import { NextRequest, NextResponse } from "next/server";
import { getFinance } from "@/lib/finance";

export const runtime = "nodejs";
// Vercel's edge answers repeat requests for 30s, then serves the last answer while it fetches a new one.
const EDGE_CACHE = { "Cache-Control": "s-maxage=30, stale-while-revalidate=600" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    return NextResponse.json(
      await getFinance({
        period: sp.get("period") ?? undefined,
        key: sp.get("key") ?? undefined,
        basis: sp.get("basis") ?? undefined,
        group: sp.get("group") ?? undefined,
      }),
      { headers: EDGE_CACHE }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
