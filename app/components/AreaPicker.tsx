"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function AreaPicker({ data, group, setGroup }: {
  data: { groups: string[]; groupSizes: Record<string, number> };
  group: string;
  setGroup: (g: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const total = Object.values(data.groupSizes).reduce((s, n) => s + n, 0);

  const options = useMemo(() => {
    const all = [{ name: "All", n: total }, ...data.groups.map((g) => ({ name: g, n: data.groupSizes[g] ?? 0 })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))];
    const t = q.trim().toLowerCase();
    return t ? all.filter((o) => o.name.toLowerCase().includes(t)) : all;
  }, [data.groups, data.groupSizes, q, total]);

  useEffect(() => {
    if (!open) return;
    setHi(0);
    setTimeout(() => input.current?.focus(), 0);
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => setHi(0), [q]);

  const pick = (g: string) => { setGroup(g); setOpen(false); setQ(""); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter" && options[hi]) pick(options[hi].name);
  };

  return (
    <div className="kb-area" ref={box}>
      <button className={`kb-area-btn${group !== "All" ? " on" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
        <span>{group === "All" ? `All areas · ${total} properties` : `${group} · ${data.groupSizes[group] ?? 0}`}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {group !== "All" && (
        <button className="kb-area-clear" onClick={() => pick("All")} aria-label="Clear area filter">×</button>
      )}
      {open && (
        <div className="kb-area-pop" onKeyDown={onKey}>
          <input ref={input} className="kb-area-search" placeholder={`Search ${data.groups.length} areas…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="kb-area-list" role="listbox">
            {options.length === 0 && <div className="kb-area-none">No area matches “{q}”</div>}
            {options.map((o, i) => (
              <button
                key={o.name}
                role="option"
                aria-selected={o.name === group}
                className={`kb-area-opt${i === hi ? " hi" : ""}${o.name === group ? " sel" : ""}`}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(o.name)}
              >
                <span>{o.name === "All" ? "All areas" : o.name}</span>
                <span className="kb-area-n">{o.n}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
