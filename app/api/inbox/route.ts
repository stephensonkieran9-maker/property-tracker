import { NextRequest, NextResponse } from "next/server";
import { getInbox } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await getInbox({ group: req.nextUrl.searchParams.get("group") ?? undefined }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
