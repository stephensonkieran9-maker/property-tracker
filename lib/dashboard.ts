import type { ChangeEvent, DashboardData, Snapshot } from "./types";
import { fetchAllListings, isDemo } from "./hostaway";
import { getSnapshots, saveSnapshot } from "./store";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fetch the live roster and store it as today's snapshot (one per day). */
export async function recordSnapshot(): Promise<Snapshot> {
  const listings = await fetchAllListings();
  const snap: Snapshot = {
    date: today(),
    count: listings.length,
    listings: listings.map((l) => ({ id: l.id, name: l.name })),
  };
  await saveSnapshot(snap);
  return snap;
}

/** Diff consecutive snapshots into a flat, newest-first in/out feed. */
function buildChanges(snaps: Snapshot[]): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  for (let i = 1; i < snaps.length; i++) {
    const prev = new Map(snaps[i - 1].listings.map((l) => [l.id, l.name]));
    const curr = new Map(snaps[i].listings.map((l) => [l.id, l.name]));
    for (const [id, name] of curr) {
      if (!prev.has(id)) events.push({ date: snaps[i].date, type: "added", id, name });
    }
    for (const [id, name] of prev) {
      if (!curr.has(id)) events.push({ date: snaps[i].date, type: "removed", id, name });
    }
  }
  return events.reverse();
}

export async function getDashboardData(): Promise<DashboardData> {
  // Record today's snapshot opportunistically so history stays fresh
  // even if the daily cron hasn't fired (e.g. first visit of the day).
  try {
    await recordSnapshot();
  } catch (err) {
    // If recording fails, still render from whatever history we have.
    console.error("recordSnapshot failed:", err);
  }

  const snaps = await getSnapshots();
  const liveListings = await fetchAllListings().catch(() => {
    const last = snaps[snaps.length - 1];
    return (last?.listings ?? []).map((l) => ({ id: l.id, name: l.name }));
  });

  const history = snaps.map((s) => ({ date: s.date, count: s.count }));
  const changes = buildChanges(snaps);

  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const added = changes.filter((c) => c.type === "added").length;
  const removed = changes.filter((c) => c.type === "removed").length;

  return {
    current: { count: liveListings.length, listings: liveListings },
    history,
    changes,
    net: {
      added,
      removed,
      net: last && first ? last.count - first.count : 0,
      since: first?.date ?? null,
    },
    demo: isDemo(),
    generatedAt: new Date().toISOString(),
  };
}
