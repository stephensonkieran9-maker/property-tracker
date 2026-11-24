import { NextRequest, NextResponse } from "next/server";
import { getBoard } from "@/lib/board";

export const runtime = "nodejs";
// Not cached at Vercel's edge: targets are edited on the board, and edits must show straight away.
// (The Hostaway snapshot behind it is already held in memory, so this stays quick.)
const EDGE_CACHE = { "Cache-Control": "private, no-store" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const board = await getBoard({ month: sp.get("month") ?? undefined, group: sp.get("group") ?? undefined });
    return NextResponse.json(board, { headers: EDGE_CACHE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
