import type { Listing, Snapshot } from "./types";

// Deterministic demo data so the dashboard renders with no API key.
// History, the in/out feed, and the live roster are all derived from a
// single onboarding timeline, so they stay internally consistent
// (no phantom adds/removals on the last day).

const CATALOG: Array<{ id: number; name: string; city: string }> = [
  { id: 1000, name: "Ocean Breeze Villa", city: "Austin" },
  { id: 1001, name: "Downtown Loft 4B", city: "Denver" },
  { id: 1002, name: "Sunset Ridge Cabin", city: "Miami" },
  { id: 1003, name: "Harbor View Suite", city: "Portland" },
  { id: 1004, name: "Maple Street Bungalow", city: "Nashville" },
  { id: 1005, name: "The Skyline Penthouse", city: "Austin" },
  { id: 1006, name: "Pinewood Retreat", city: "Denver" },
  { id: 1007, name: "Riverside Cottage", city: "Miami" },
  { id: 1008, name: "Cactus Flats Casita", city: "Portland" },
  { id: 1009, name: "Lakehouse on 7th", city: "Nashville" },
  { id: 1010, name: "Old Town Studio", city: "Austin" },
  { id: 1011, name: "Meadowbrook Farmhouse", city: "Denver" },
  { id: 1012, name: "The Copper Door", city: "Miami" },
  { id: 1013, name: "Seagrass Beach House", city: "Portland" },
  { id: 1014, name: "Aspen Corner Condo", city: "Nashville" },
  { id: 1015, name: "Willow Creek Lodge", city: "Austin" },
  { id: 1016, name: "Bayfront Bungalow", city: "Denver" },
  { id: 1017, name: "The Ivy Townhome", city: "Miami" },
  { id: 1018, name: "Desert Star Rental", city: "Portland" },
  { id: 1019, name: "Granite Peak Chalet", city: "Nashville" },
];

// day index (0-59) → roster change. Starts with 11 already onboarded (day 0).
type Ev = { day: number; type: "added" | "removed"; id: number };
const EVENTS: Ev[] = [
  { day: 4, type: "added", id: 1011 },
  { day: 8, type: "added", id: 1012 },
  { day: 12, type: "added", id: 1013 },
  { day: 16, type: "added", id: 1014 },
  { day: 20, type: "added", id: 1015 },
  { day: 23, type: "removed", id: 1015 }, // churned...
  { day: 24, type: "added", id: 1016 },
  { day: 28, type: "added", id: 1017 },
  { day: 34, type: "added", id: 1015 }, // ...won back
  { day: 42, type: "added", id: 1018 },
  { day: 50, type: "added", id: 1019 },
  { day: 55, type: "removed", id: 1007 },
];

const START = new Date("2026-06-12T00:00:00Z");
const DAYS = 60;

function buildSnapshots(): Snapshot[] {
  const active = new Set<number>([1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010]);
  const byDay = new Map<number, Ev[]>();
  for (const e of EVENTS) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }

  const snaps: Snapshot[] = [];
  for (let day = 0; day < DAYS; day++) {
    for (const e of byDay.get(day) ?? []) {
      if (e.type === "added") active.add(e.id);
      else active.delete(e.id);
    }
    const d = new Date(START.getTime() + day * 86400000);
    const listings = CATALOG.filter((c) => active.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
    snaps.push({ date: d.toISOString().slice(0, 10), count: listings.length, listings });
  }
  return snaps;
}

const SNAPSHOTS = buildSnapshots();

export function mockHistory(): Snapshot[] {
  // Return a fresh copy so callers can't mutate the shared timeline.
  return SNAPSHOTS.map((s) => ({ ...s, listings: s.listings.map((l) => ({ ...l })) }));
}

/** Live roster = the active set on the final day of the timeline. */
export function mockListings(): Listing[] {
  const last = SNAPSHOTS[SNAPSHOTS.length - 1];
  const ids = new Set(last.listings.map((l) => l.id));
  return CATALOG.filter((c) => ids.has(c.id)).map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    status: "active",
  }));
}
