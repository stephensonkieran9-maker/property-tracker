"use client";

import { useEffect, useMemo, useState } from "react";

export interface HostawayListing {
  id: number;
  name: string;
  city: string | null;
}

let cache: Promise<HostawayListing[]> | null = null;
function loadListings(): Promise<HostawayListing[]> {
  if (!cache) {
    cache = fetch("/api/portal/listings", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Couldn't load properties.");
        return j.listings as HostawayListing[];
      })
      .catch((e) => {
        cache = null; // try again next time
        throw e;
      });
  }
  return cache;
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1));

/** Best Hostaway match for a name read from a screenshot, if it's a confident one. */
export function bestMatch(name: string, list: HostawayListing[]): HostawayListing | null {
  const a = words(name);
  if (!a.size) return null;
  let best: HostawayListing | null = null;
  let score = 0;
  for (const l of list) {
    const b = words(l.name);
    let common = 0;
    a.forEach((w) => b.has(w) && common++);
    const s = common / Math.min(a.size, b.size || 1);
    if (s > score) [best, score] = [l, s];
  }
  return score >= 0.6 ? best : null;
}

export default function PropertyPicker({
  value, guess, onPick,
}: {
  value: number | null;
  /** Name read from the screenshot, used to suggest a match. */
  guess: string;
  onPick: (l: HostawayListing | null, auto?: boolean) => void;
}) {
  const [list, setList] = useState<HostawayListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadListings().then(setList).catch((e) => setError(e.message));
  }, []);

  // First time the list arrives: suggest the closest property to the screenshot's name.
  useEffect(() => {
    if (list && value === null && guess) {
      const m = bestMatch(guess, list);
      if (m) onPick(m, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const selected = list?.find((l) => l.id === value) ?? null;
  const shown = useMemo(() => {
    if (!list) return [];
    const t = q.trim().toLowerCase();
    const f = t ? list.filter((l) => `${l.name} ${l.city ?? ""}`.toLowerCase().includes(t)) : list;
    return f.slice(0, 60);
  }, [list, q]);

  if (error) return <div className="pt-hint">{error} Type the property name in the box below instead.</div>;
  if (!list) return <div className="pt-hint">Loading Keapr properties from Hostaway…</div>;

  if (selected && !open) {
    return (
      <div className="pt-picked">
        <div>
          <b>{selected.name}</b>
          <span>{selected.city ?? "Hostaway"} · #{selected.id}</span>
        </div>
        <button type="button" className="pt-link" onClick={() => { setOpen(true); setQ(""); }}>Change</button>
      </div>
    );
  }

  return (
    <div className="pt-picker">
      <input
        type="search"
        autoFocus={open}
        placeholder={`Search ${list.length} Keapr properties…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul role="listbox">
        {shown.map((l) => (
          <li key={l.id}>
            <button type="button" onClick={() => { onPick(l); setOpen(false); setQ(""); }}>
              <b>{l.name}</b>
              <span>{l.city ?? ""}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="pt-none">No property matches “{q}”.</li>}
      </ul>
      {selected && <button type="button" className="pt-link" onClick={() => setOpen(false)}>Keep {selected.name}</button>}
    </div>
  );
}
