// Client-safe formatting helpers for the portal screens.
export const gbp = (n: number | null | undefined) => (n === null || n === undefined ? "—" : "£" + Math.round(n).toLocaleString("en-GB"));
export const gbp2 = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const short = (n: number) => (n >= 1_000_000 ? `£${(n / 1e6).toFixed(2)}m` : n >= 10_000 ? `£${(n / 1000).toFixed(1)}k` : gbp(n));
export const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
export const ukDate = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "Europe/London" }) : "—";
export const ukDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
export const monthName = (m: string) => new Date(m + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const shiftMonth = (m: string, by: number) => {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm - 1 + by, 1)).toISOString().slice(0, 7);
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) {
    location.href = "/login?next=" + encodeURIComponent(location.pathname);
    throw new Error("Please sign in again.");
  }
  if (!res.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { status: res.status, body: j });
  return j as T;
}

export async function signOut() {
  await fetch("/api/portal/logout", { method: "POST" }).catch(() => {});
  location.href = "/login";
}

/** Shrinks a screenshot before upload (keeps text sharp, stays under the size limit). */
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.size < 1_500_000 || !/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}
