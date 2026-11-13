// One shared snapshot of everything the board needs from Hostaway.
//
// Why: fetching from Hostaway takes many seconds (thousands of bookings, dozens
// of guest threads). Every page used to do that on every load. Now:
//   1. The snapshot is kept in memory and in a PRIVATE Vercel Blob file, so any
//      server instance and any page can read it in well under a second.
//   2. If it's more than 5 minutes old, the page still gets it instantly and a
//      fresh copy is fetched in the background for the next visitor.
//   3. Only if there's no snapshot at all (first ever load) does a request wait.
import { waitUntil } from "@vercel/functions";
import type { Conversation, RawData, Unit } from "./boardTypes";
import type { Listing } from "./types";
import { addDays, londonToday } from "./dates";
import { fetchAllListings, isDemo } from "./hostaway";
import { fetchConversations, fetchReservations } from "./hostawayBoard";
import { recordAndDiffLosses } from "./store";

export interface Snapshot extends RawData {
  listings: Listing[];
  trackingSince: string | null;
  fetchedAt: number; // ms since epoch
}

const PATH = "keapr-board/cache/snapshot.json";
const FRESH_MS = 5 * 60 * 1000; // refresh in the background after 5 minutes
const MAX_STALE_MS = 12 * 60 * 60 * 1000; // older than this: wait for fresh data

let mem: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

const blobOn = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function readBlob(): Promise<Snapshot | null> {
  if (!blobOn()) return null;
  try {
    const { get } = await import("@vercel/blob");
    const r = await get(PATH, { access: "private", useCache: false });
    if (!r) return null;
    return JSON.parse(await new Response(r.stream).text()) as Snapshot;
  } catch {
    return null;
  }
}

async function writeBlob(s: Snapshot): Promise<void> {
  if (!blobOn()) return;
  try {
    const { put } = await import("@vercel/blob");
    // Private: guest names and messages must never be on a public URL.
    await put(PATH, JSON.stringify(s), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (e) {
    // If the store can't hold private files we simply don't persist (memory cache still works).
    console.warn("Snapshot not saved to Blob:", e instanceof Error ? e.message : e);
  }
}

/** Pull everything fresh from Hostaway. */
async function build(): Promise<Snapshot> {
  const today = londonToday();
  const listings = await fetchAllListings();
  const units: Unit[] = listings.map((l) => ({
    id: l.id,
    name: l.name,
    group: l.city?.trim() || "Other",
    onboardedAt: l.onboardedAt,
  }));
  // ~26 months back covers Finance's 12-month trend plus the same months last year.
  const [reservations, conversations, lossState] = await Promise.all([
    fetchReservations(addDays(today, -800), addDays(today, 400)),
    fetchConversations(addDays(today, -14) + " 00:00").catch(() => [] as Conversation[]),
    recordAndDiffLosses(listings, today).catch(() => ({ losses: [], trackingSince: null })),
  ]);
  return {
    listings,
    units,
    reservations,
    conversations,
    losses: lossState.losses.map((l) => ({ date: l.date, id: l.id, name: l.name, group: l.city?.trim() || "Other" })),
    trackingSince: lossState.trackingSince,
    fetchedAt: Date.now(),
  };
}

function refresh(): Promise<Snapshot> {
  if (!inflight) {
    inflight = build()
      .then(async (s) => {
        mem = s;
        await writeBlob(s);
        return s;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The latest snapshot: instant when one exists, refreshed in the background when stale. */
export async function getSnapshot(opts: { force?: boolean } = {}): Promise<Snapshot> {
  if (isDemo()) throw new Error("getSnapshot is not used in demo mode");
  if (opts.force) return refresh();

  if (!mem) mem = await readBlob();
  if (mem && mem.fetchedAt < Date.now() - MAX_STALE_MS) return refresh();
  if (mem) {
    if (Date.now() - mem.fetchedAt > FRESH_MS && !inflight) {
      // Answer now; let the function keep running to finish the refresh.
      waitUntil(refresh().catch((e) => console.error("Background refresh failed:", e)));
    }
    return mem;
  }
  return refresh();
}
