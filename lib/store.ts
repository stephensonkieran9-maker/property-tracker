import { promises as fs } from "fs";
import path from "path";
import type { Snapshot } from "./types";
import { mockHistory } from "./mock";
import { isDemo } from "./hostaway";

const KV_KEY = "property-tracker:snapshots";

// Works with either naming convention Vercel injects:
//  - Upstash Redis integration: UPSTASH_REDIS_REST_URL / _TOKEN
//  - legacy Vercel KV:          KV_REST_API_URL / _TOKEN
function redisConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  return null;
}

// ── Upstash Redis REST backend ───────────────────────────────
async function redisCommand<T>(cfg: { url: string; token: string }, command: unknown[]): Promise<T> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Redis command failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { result: T };
  return json.result;
}

async function redisGet(cfg: { url: string; token: string }): Promise<Snapshot[]> {
  const raw = await redisCommand<string | null>(cfg, ["GET", KV_KEY]);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Snapshot[];
  } catch {
    return [];
  }
}

async function redisSet(cfg: { url: string; token: string }, snaps: Snapshot[]): Promise<void> {
  await redisCommand(cfg, ["SET", KV_KEY, JSON.stringify(snaps)]);
}

// ── Local file backend (dev / demo only) ─────────────────────
const FILE = path.join(process.cwd(), ".data", "snapshots.json");

async function fileGet(): Promise<Snapshot[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as Snapshot[];
  } catch {
    // First run with no store. In demo mode, seed sample history so the UI
    // has something to show; in real mode, start empty and build from today.
    return isDemo() ? mockHistory() : [];
  }
}

async function fileSet(snaps: Snapshot[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(snaps, null, 2), "utf8");
}

// ── Public API ───────────────────────────────────────────────
export async function getSnapshots(): Promise<Snapshot[]> {
  const cfg = redisConfig();
  const snaps = cfg ? await redisGet(cfg) : await fileGet();
  return snaps.sort((a, b) => a.date.localeCompare(b.date));
}

/** Upsert one snapshot per day (keyed by date). */
export async function saveSnapshot(snap: Snapshot): Promise<Snapshot[]> {
  const cfg = redisConfig();
  const snaps = cfg ? await redisGet(cfg) : await fileGet();
  const idx = snaps.findIndex((s) => s.date === snap.date);
  if (idx >= 0) snaps[idx] = snap;
  else snaps.push(snap);
  snaps.sort((a, b) => a.date.localeCompare(b.date));

  if (cfg) await redisSet(cfg, snaps);
  else await fileSet(snaps);
  return snaps;
}
