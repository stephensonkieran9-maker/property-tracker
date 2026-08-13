import type { Listing } from "./types";

// Deterministic demo data so the dashboard renders with no API key.
// Mirrors the real shape: each listing has an onboarding date (insertedOn),
// spread across ~14 months so the growth chart and monthly totals look real.

const NAMES = [
  "Ocean Breeze Villa", "Downtown Loft 4B", "Sunset Ridge Cabin", "Harbor View Suite",
  "Maple Street Bungalow", "The Skyline Penthouse", "Pinewood Retreat", "Riverside Cottage",
  "Cactus Flats Casita", "Lakehouse on 7th", "Old Town Studio", "Meadowbrook Farmhouse",
  "The Copper Door", "Seagrass Beach House", "Aspen Corner Condo", "Willow Creek Lodge",
  "Bayfront Bungalow", "The Ivy Townhome", "Desert Star Rental", "Granite Peak Chalet",
  "Marina Bay Flat", "Cedar Hollow Cabin", "The Tidewater House", "Juniper Hill Cottage",
];

const CITIES = ["Austin", "Denver", "Miami", "Portland", "Nashville"];

// How many properties were onboarded in each month, oldest first.
// Sums to NAMES.length so every demo listing gets a real date.
const MONTHLY: Array<[string, number]> = [
  ["2025-06", 6], ["2025-08", 1], ["2025-09", 2], ["2025-10", 3],
  ["2025-11", 2], ["2025-12", 3], ["2026-02", 1], ["2026-04", 2],
  ["2026-06", 2], ["2026-07", 1], ["2026-08", 1],
];

export function mockListings(): Listing[] {
  const out: Listing[] = [];
  let i = 0;
  for (const [month, n] of MONTHLY) {
    for (let k = 0; k < n && i < NAMES.length; k++, i++) {
      const day = String(3 + ((k * 7) % 25)).padStart(2, "0");
      out.push({
        id: 1000 + i,
        name: NAMES[i],
        city: CITIES[i % CITIES.length],
        onboardedAt: `${month}-${day}`,
      });
    }
  }
  return out;
}
