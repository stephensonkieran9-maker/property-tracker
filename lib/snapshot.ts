// One shared snapshot of everything the board needs from Hostaway.
//
// A full pull from Hostaway takes ~7s, so nobody should ever wait for one if
// any copy exists:
//   1. The snapshot lives in memory and in Vercel Blob, so a freshly started
//      server reads it in a fraction of a second.
//   2. Any saved copy, however old, is served immediately; if it's over
//      5 minutes old a fresh pull runs in the background for the next visitor.
//   3. Only when no copy exists anywhere does a request wait.
//
// Storage: a private Blob file. If the store can't hold private files, the
// snapshot is saved encrypted (AES-256-GCM, key derived from the Hostaway API
// key), so guest names and messages are unreadable even if the file's URL is
// found. Both are gzip-compressed.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { gunzipSync, gzipSync } from "zlib";
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

const PRIVATE_PATH = "keapr-board/cache/snapshot.json.gz";
const ENC_PATH = "keapr-board/cache/snapshot.enc";
const FRESH_MS = 5 * 60 * 1000;

let mem: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

/** What happened most recently, for /api/health. */
export const status = {
  servedFrom: "none" as "memory" | "storage" | "fresh-wait" | "none",
  storage: "unknown" as "private" | "encrypted" | "none" | "unknown",
  lastStorageError: null as string | null,
  lastBuildMs: null as number | null,
  lastBuildAt: null as number | null,
  lastBuildError: null as string | null,
  lastReadMs: null as number | null,
};

const blobOn = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function key(): Buffer {
  const secret = process.env.SNAPSHOT_SECRET || process.env.HOSTAWAY_API_KEY || "";
  return createHash("sha256").update("keapr-snapshot:" + secret).digest();
}
function encrypt(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}
function decrypt(buf: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

async function readStorage(): Promise<Snapshot | null> {
  if (!blobOn()) {
    status.storage = "none";
    return null;
  }
  const t0 = Date.now();
  const blob = await import("@vercel/blob");
  // 1. Private file.
  try {
    const r = await blob.get(PRIVATE_PATH, { access: "private", useCache: false });
    if (r) {
      const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
      status.storage = "private";
      status.lastReadMs = Date.now() - t0;
      return JSON.parse(gunzipSync(buf).toString("utf8")) as Snapshot;
    }
  } catch {
    /* fall through to the encrypted copy */
  }
  // 2. Encrypted file.
  try {
    const { blobs } = await blob.list({ prefix: ENC_PATH, limit: 1 });
    if (blobs[0]) {
      const res = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        status.storage = "encrypted";
        status.lastReadMs = Date.now() - t0;
        return JSON.parse(gunzipSync(decrypt(buf)).toString("utf8")) as Snapshot;
      }
    }
  } catch (e) {
    status.lastStorageError = "read: " + (e instanceof Error ? e.message : String(e));
  }
  return null;
}

async function writeStorage(s: Snapshot): Promise<void> {
  if (!blobOn()) return;
  const blob = await import("@vercel/blob");
  const gz = gzipSync(Buffer.from(JSON.stringify(s)));
  try {
    await blob.put(PRIVATE_PATH, gz, { access: "private", contentType: "application/gzip", addRandomSuffix: false, allowOverwrite: true });
    status.storage = "private";
    status.lastStorageError = null;
    return;
  } catch (e) {
    status.lastStorageError = "private write: " + (e instanceof Error ? e.message : String(e));
  }
  try {
    await blob.put(ENC_PATH, encrypt(gz), {
      access: "public",
      contentType: "application/octet-stream",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    status.storage = "encrypted";
  } catch (e) {
    status.storage = "none";
    status.lastStorageError += " | encrypted write: " + (e instanceof Error ? e.message : String(e));
  }
}

/** Pull everything fresh from Hostaway. Reuses message text for threads that haven't changed. */
async function build(prev: Snapshot | null): Promise<Snapshot> {
  const t0 = Date.now();
  const today = londonToday();
  const listings = await fetchAllListings();
  const units: Unit[] = listings.map((l) => ({
    id: l.id,
    name: l.name,
    group: l.city?.trim() || "Other",
    onboardedAt: l.onboardedAt,
  }));
  const known = new Map((prev?.conversations ?? []).map((c) => [c.id, c]));
  const [reservations, conversations, lossState] = await Promise.all([
    fetchReservations(addDays(today, -800), addDays(today, 400)),
    fetchConversations(addDays(today, -14) + " 00:00", known).catch(() => prev?.conversations ?? ([] as Conversation[])),
    recordAndDiffLosses(listings, today).catch(() => ({ losses: [], trackingSince: prev?.trackingSince ?? null })),
  ]);
  status.lastBuildMs = Date.now() - t0;
  status.lastBuildAt = Date.now();
  status.lastBuildError = null;
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
    inflight = build(mem)
      .then(async (s) => {
        mem = s;
        await writeStorage(s);
        return s;
      })
      .catch((e) => {
        status.lastBuildError = e instanceof Error ? e.message : String(e);
        if (mem) return mem; // keep serving the last good copy
        throw e;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

let storageChecked = false;

/** The latest snapshot: instant whenever any copy exists, refreshed in the background when stale. */
export async function getSnapshot(opts: { force?: boolean } = {}): Promise<Snapshot> {
  if (isDemo()) throw new Error("getSnapshot is not used in demo mode");
  if (opts.force) return refresh();

  if (mem) {
    status.servedFrom = "memory";
  } else if (!storageChecked) {
    storageChecked = true;
    const stored = await readStorage();
    if (stored && (!mem || stored.fetchedAt > (mem as Snapshot).fetchedAt)) mem = stored;
    if (mem) status.servedFrom = "storage";
  }
  if (mem) {
    if (Date.now() - mem.fetchedAt > FRESH_MS && !inflight) {
      waitUntil(refresh().catch((e) => console.error("Background refresh failed:", e)));
    }
    return mem;
  }
  status.servedFrom = "fresh-wait";
  return refresh();
}

export function snapshotAgeMs(): number | null {
  return mem ? Date.now() - mem.fetchedAt : null;
}
