import { promises as fs } from "fs";
import path from "path";
import type { Listing, LossEvent } from "./types";

// Persisted state for loss-tracking. We keep the last-seen roster so we can
// diff against the current live roster, plus an append-only list of losses.
export interface TrackState {
  roster: Array<{ id: number; name: string; city?: string }>;
  losses: LossEvent[];
  trackingSince: string | null;
}

const EMPTY: TrackState = { roster: [], losses: [], trackingSince: null };
const BLOB_PATH = "property-tracker/state.json";

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// ── Vercel Blob backend ──────────────────────────────────────
async function blobLoad(): Promise<TrackState> {
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    if (!blobs.length) return { ...EMPTY };
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) return { ...EMPTY };
    return (await res.json()) as TrackState;
  } catch {
    return { ...EMPTY };
  }
}

async function blobSave(state: TrackState): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(BLOB_PATH, JSON.stringify(state), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// ── Local file backend (dev only) ────────────────────────────
const FILE = path.join(process.cwd(), ".data", "state.json");

async function fileLoad(): Promise<TrackState> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as TrackState;
  } catch {
    return { ...EMPTY };
  }
}

async function fileSave(state: TrackState): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
}

// ── Public API ───────────────────────────────────────────────

/** True when a persistent store is available (Blob in prod, file in dev). */
export function storeAvailable(): boolean {
  return blobConfigured() || process.env.NODE_ENV !== "production";
}

async function load(): Promise<TrackState> {
  return blobConfigured() ? blobLoad() : fileLoad();
}

async function save(state: TrackState): Promise<void> {
  if (blobConfigured()) await blobSave(state);
  else await fileSave(state);
}

/**
 * Compare the live roster to the last snapshot, record any disappearances as
 * losses, then persist the new roster. Returns the losses list (newest first).
 * No-op returning [] when no store is available.
 */
export async function recordAndDiffLosses(
  live: Listing[],
  today: string
): Promise<{ losses: LossEvent[]; trackingSince: string | null }> {
  if (!storeAvailable()) return { losses: [], trackingSince: null };

  const state = await load();
  if (!state.trackingSince) state.trackingSince = today;

  const liveIds = new Set(live.map((l) => l.id));
  const seen = new Set(state.losses.map((e) => `${e.id}:${e.date}`));

  // Anything in the previous roster but missing now = a loss.
  for (const prev of state.roster) {
    if (!liveIds.has(prev.id) && !seen.has(`${prev.id}:${today}`)) {
      state.losses.push({ date: today, id: prev.id, name: prev.name, city: prev.city });
    }
  }

  // Refresh the roster to the current live set.
  state.roster = live.map((l) => ({ id: l.id, name: l.name, city: l.city }));

  await save(state);

  const losses = [...state.losses].sort((a, b) => b.date.localeCompare(a.date));
  return { losses, trackingSince: state.trackingSince };
}
