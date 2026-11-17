import { NextResponse } from "next/server";
import { isDemo } from "@/lib/hostaway";
import { getSnapshot, snapshotAgeMs, status } from "@/lib/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Shows how the data cache is doing: where the last answer came from, how old it is, whether it's being saved.
export async function GET() {
  if (isDemo()) return NextResponse.json({ demo: true });
  const t0 = Date.now();
  await getSnapshot().catch(() => null);
  const age = snapshotAgeMs();
  return NextResponse.json({
    answeredInMs: Date.now() - t0,
    servedFrom: status.servedFrom,
    snapshotAgeMinutes: age === null ? null : Math.round(age / 60000),
    savedTo: status.storage,
    storageReadMs: status.lastReadMs,
    lastFullPullSeconds: status.lastBuildMs === null ? null : Math.round(status.lastBuildMs / 100) / 10,
    lastStorageError: status.lastStorageError,
    lastPullError: status.lastBuildError,
  });
}
