import { NextRequest, NextResponse } from "next/server";
import { getBoard } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const board = await getBoard({ month: sp.get("month") ?? undefined, group: sp.get("group") ?? undefined });
    return NextResponse.json(board);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
