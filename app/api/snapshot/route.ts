import { NextRequest, NextResponse } from "next/server";
import { recordSnapshot } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Triggered daily by Vercel Cron (see vercel.json). Vercel automatically
// sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const snap = await recordSnapshot();
    return NextResponse.json({ ok: true, snapshot: snap });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
