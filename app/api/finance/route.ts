import { NextRequest, NextResponse } from "next/server";
import { getFinance } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    return NextResponse.json(
      await getFinance({
        period: sp.get("period") ?? undefined,
        key: sp.get("key") ?? undefined,
        basis: sp.get("basis") ?? undefined,
        group: sp.get("group") ?? undefined,
      })
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
