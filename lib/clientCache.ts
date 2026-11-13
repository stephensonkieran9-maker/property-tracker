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
