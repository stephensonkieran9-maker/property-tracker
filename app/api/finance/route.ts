import { NextRequest, NextResponse } from "next/server";
import { getFinance } from "@/lib/finance";

export const runtime = "nodejs";
// Not cached at Vercel's edge: it includes offers, which change all day. (Hostaway data is held in memory.)
const EDGE_CACHE = { "Cache-Control": "private, no-store" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
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
