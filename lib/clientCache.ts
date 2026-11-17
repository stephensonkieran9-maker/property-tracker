// Remember the last response for each page in the browser, so a page shows its
// last numbers instantly and then swaps in fresh ones when they arrive.
const PREFIX = "kb:v1:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readCache<T>(url: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + url);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at: number; data: T };
    return Date.now() - at < MAX_AGE_MS ? data : null;
  } catch {
    return null;
  }
}

export function writeCache(url: string, data: unknown): void {
  try {
    localStorage.setItem(PREFIX + url, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Storage full or unavailable: clear our old entries and carry on.
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
    } catch {}
  }
}

/** The default data URL of every page, exactly as each page requests it. */
export const PAGE_URLS = [
  "/api/board?", // Pulse, Overview
  "/api/board", // Targets
  "/api/targets/history",
  "/api/inbox",
  "/api/finance?period=month&basis=stay",
  "/api/data", // Growth
];

let warmed = false;
/** After the first page loads, quietly fetch every other page's data so switching tabs is instant. */
export function warmOtherPages(): void {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  const run = async () => {
    for (const url of PAGE_URLS) {
      try {
        const res = await fetch(url);
        if (res.ok) writeCache(url, await res.json());
      } catch {
        /* best-effort */
      }
    }
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(() => void run());
  else setTimeout(() => void run(), 1500);
}

// True once the app has started in this tab. Pages opened after that (by switching tabs)
// can show their saved numbers on the very first frame instead of a loading screen.
let hydrated = false;
export function markHydrated(): void {
  hydrated = true;
}
export function cachedOnSwitch<T>(url: string): T | null {
  return hydrated ? readCache<T>(url) : null;
}
