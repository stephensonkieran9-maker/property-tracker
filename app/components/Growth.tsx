"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import { readCache, writeCache } from "@/lib/clientCache";
import type { DashboardData } from "@/lib/types";

const MONTHS_SHOWN = 12;

function prettyDate(iso: string, withYear = true): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function monthName(ym: string, short = false): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

function lastMonths(n: number, today: string): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export default function Growth() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const cached = readCache<DashboardData>("/api/data");
      if (cached) setData(cached);
      const res = await fetch("/api/data", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      writeCache("/api/data", json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="kb">
      <Sidebar active="growth" />
      <main className="kb-main">
        {!data && !error && <div className="kb-loading">Loading the portfolio…</div>}
        {error && !data && <div className="kb-error">Couldn&apos;t load the portfolio: {error}</div>}
        {data && (
          <div className={`kb-fade${busy ? " busy" : ""}`}>
            <Head data={data} busy={busy} onRefresh={load} />
            <Kpis data={data} />
            <GrowthChart data={data} />
            <ByMonth data={data} month={month} setMonth={setMonth} />
            <Feeds data={data} month={month} setMonth={setMonth} q={q} setQ={setQ} />
          </div>
        )}
      </main>
    </div>
  );
}

function Head({ data, busy, onRefresh }: { data: DashboardData; busy: boolean; onRefresh: () => void }) {
  const today = data.generatedAt.slice(0, 10);
  const time = new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return (
    <div className="kb-head">
      <div>
        <div className="kb-date">
          {new Date(today + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
        </div>
        <h1 className="kb-hello">
          Portfolio <em>growth.</em>
        </h1>
      </div>
      <div className="kb-headr">
        {data.demo && <span className="kb-demo">DEMO DATA</span>}
        <span className="kb-updated">Updated {time}</span>
        <button className="kb-area-btn" onClick={onRefresh} disabled={busy}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
          <span>{busy ? "Refreshing…" : "Refresh"}</span>
        </button>
      </div>
    </div>
  );
}

function Kpis({ data }: { data: DashboardData }) {
  const { stats, current } = data;
  const vsPrev = stats.thisMonth - stats.prevMonth;
  return (
    <div className="kb-kpis kb-kpis-6" style={{ marginBottom: 14 }}>
      <div className="kb-kpi">
        <span className="kb-kpi-l">Properties now</span>
        <span className="kb-kpi-v">{current.count}</span>
        <span className="kb-kpi-s">Live in Hostaway</span>
      </div>
      <div className="kb-kpi">
        <span className="kb-kpi-l">Brought on this month</span>
        <span className={`kb-kpi-v${stats.thisMonth > 0 ? " kb-up" : ""}`}>{signed(stats.thisMonth)}</span>
        <span className="kb-kpi-s">
          {vsPrev !== 0 && <span className={vsPrev > 0 ? "kb-up" : "kb-down"}>{vsPrev > 0 ? "▲" : "▼"} {Math.abs(vsPrev)} </span>}{vsPrev === 0 ? "Same as" : "vs"} last month ({stats.prevMonth})
        </span>
      </div>
      <div className="kb-kpi">
        <span className="kb-kpi-l">Lost this month</span>
        <span className={`kb-kpi-v${stats.lostThisMonth ? " kb-down" : ""}`}>{stats.lostThisMonth ? `−${stats.lostThisMonth}` : "0"}</span>
        <span className="kb-kpi-s">Removed from Hostaway</span>
      </div>
      <div className="kb-kpi">
        <span className="kb-kpi-l">Net this month</span>
        <span className={`kb-kpi-v ${stats.netThisMonth > 0 ? "kb-up" : stats.netThisMonth < 0 ? "kb-down" : ""}`}>{signed(stats.netThisMonth)}</span>
        <span className="kb-kpi-s">Brought on minus lost</span>
      </div>
      <div className="kb-kpi">
        <span className="kb-kpi-l">Last 30 days</span>
        <span className="kb-kpi-v">{signed(stats.last30)}</span>
        <span className="kb-kpi-s">Brought on</span>
      </div>
      <div className="kb-kpi">
        <span className="kb-kpi-l">Lost since tracking</span>
        <span className="kb-kpi-v">{stats.lostTotal}</span>
        <span className="kb-kpi-s">{stats.trackingSince ? `Since ${prettyDate(stats.trackingSince)}` : "Tracking not started"}</span>
      </div>
    </div>
  );
}

function GrowthChart({ data }: { data: DashboardData }) {
  const pts = data.history;
  const [hover, setHover] = useState<number | null>(null);
  if (pts.length < 2) {
    return (
      <section className="kb-card" style={{ marginBottom: 14 }}>
        <h3>Portfolio over time</h3>
        <p className="kb-sub">Not enough history to chart yet.</p>
      </section>
    );
  }
  const W = 1000, H = 240, L = 40, R = 14, T = 14, B = 26;
  const t0 = new Date(pts[0].date).getTime();
  const t1 = Math.max(new Date(pts[pts.length - 1].date).getTime(), t0 + 1);
  const max = Math.max(...pts.map((p) => p.count)) * 1.08 || 1;
  const x = (d: string) => L + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  // Step line: the count holds until the next change.
  let line = `M${x(pts[0].date).toFixed(1)},${y(pts[0].count).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    line += ` H${x(pts[i].date).toFixed(1)} V${y(pts[i].count).toFixed(1)}`;
  }
  const area = `${line} V${y(0)} H${x(pts[0].date)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * max));
  const yearTicks: string[] = [];
  const startY = Number(pts[0].date.slice(0, 4));
  const endY = Number(pts[pts.length - 1].date.slice(0, 4));
  for (let yr = startY; yr <= endY; yr++) {
    for (const mm of ["01", "07"]) {
      const d = `${yr}-${mm}-01`;
      if (d > pts[0].date && d < pts[pts.length - 1].date) yearTicks.push(d);
    }
  }
  const h = hover !== null ? pts[hover] : null;

  return (
    <section className="kb-card" style={{ marginBottom: 14 }}>
      <h3>Portfolio over time</h3>
      <p className="kb-sub">Total properties since {prettyDate(pts[0].date)}</p>
      <div style={{ position: "relative" }}>
        <svg
          className="kb-chart"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ height: 240 }}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const vx = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            for (let i = 0; i < pts.length; i++) if (x(pts[i].date) <= vx) best = i;
            setHover(best);
          }}
        >
          <defs>
            <linearGradient id="kgArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f2c14e" stopOpacity="0.25" />
              <stop offset="1" stopColor="#f2c14e" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#26262a" vectorEffect="non-scaling-stroke" />
              <text x={L - 8} y={y(t) + 3} fill="#66666c" fontSize="10" textAnchor="end">{t}</text>
            </g>
          ))}
          {yearTicks.map((d) => (
            <text key={d} x={x(d)} y={H - 8} fill="#66666c" fontSize="10" textAnchor="middle">
              {monthName(d.slice(0, 7), true)} {d.slice(2, 4)}
            </text>
          ))}
          <path d={area} fill="url(#kgArea)" />
          <path d={line} fill="none" stroke="#f2c14e" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
          {h && (
            <>
              <line x1={x(h.date)} x2={x(h.date)} y1={T} y2={y(0)} stroke="#66666c" vectorEffect="non-scaling-stroke" />
              <circle cx={x(h.date)} cy={y(h.count)} r="4" fill="#f2c14e" />
            </>
          )}
        </svg>
        {h && (
          <div className="kb-tip">
            <b>{prettyDate(h.date)}</b> · {h.count} properties
          </div>
        )}
      </div>
    </section>
  );
}

function ByMonth({ data, month, setMonth }: { data: DashboardData; month: string | null; setMonth: (m: string | null) => void }) {
  const today = data.generatedAt.slice(0, 10);
  const months = useMemo(() => {
    const keys = lastMonths(MONTHS_SHOWN, today);
    return keys.map((k) => {
      const inn = data.onboardings.filter((o) => o.date.startsWith(k)).length;
      const out = data.losses.filter((o) => o.date.startsWith(k)).length;
      return { key: k, inn, out, net: inn - out };
    });
  }, [data, today]);
  const max = Math.max(1, ...months.map((m) => Math.max(m.inn, m.out)));

  return (
    <section className="kb-card" style={{ marginBottom: 14 }}>
      <div className="kb-cardhead">
        <div>
          <h3>By month</h3>
          <p className="kb-sub">Brought on (gold) and lost (red), last {MONTHS_SHOWN} months. Click a month to see its properties below.</p>
        </div>
        {month && (
          <button className="kb-more" style={{ marginTop: 0 }} onClick={() => setMonth(null)}>
            Clear month
          </button>
        )}
      </div>
      <div className="kg-months">
        {months.map((m) => (
          <button
            key={m.key}
            className={`kg-month${month === m.key ? " on" : ""}${month && month !== m.key ? " dim" : ""}`}
            onClick={() => setMonth(month === m.key ? null : m.key)}
            title={`${monthName(m.key)}: +${m.inn} brought on, −${m.out} lost`}
          >
            <span className={`kg-net ${m.net > 0 ? "kb-up" : m.net < 0 ? "kb-down" : ""}`}>{signed(m.net)}</span>
            <span className="kg-bars">
              <span className="kg-up">
                <i style={{ height: `${(m.inn / max) * 100}%` }}>{m.inn > 0 && <em>{m.inn}</em>}</i>
              </span>
              <span className="kg-down">
                <i style={{ height: `${(m.out / max) * 100}%` }}>{m.out > 0 && <em>{m.out}</em>}</i>
              </span>
            </span>
            <span className="kg-label">{monthName(m.key, true)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Feeds({ data, month, setMonth, q, setQ }: {
  data: DashboardData; month: string | null; setMonth: (m: string | null) => void; q: string; setQ: (s: string) => void;
}) {
  const t = q.trim().toLowerCase();
  const match = (o: { name: string; city?: string; date: string }) =>
    (!month || o.date.startsWith(month)) && (!t || o.name.toLowerCase().includes(t) || (o.city ?? "").toLowerCase().includes(t));
  const ins = data.onboardings.filter(match);
  const outs = data.losses.filter(match);
  const scope = month ? monthName(month) : "All time";

  return (
    <>
      <div className="kg-feedbar">
        <div className="kg-scope">
          {scope}
          {month && <button className="kb-area-clear" onClick={() => setMonth(null)} aria-label="Show all months">×</button>}
        </div>
        <input className="kg-search" placeholder="Search properties or areas…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="kb-grid kb-two" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <section className="kb-card">
          <h3>Brought on <span className="kg-count">{ins.length}</span></h3>
          <p className="kb-sub">Newest first, by the date it was added to Hostaway</p>
          <FeedList items={ins} kind="in" empty={month ? "Nothing brought on this month." : "No properties match."} />
        </section>
        <section className="kb-card">
          <h3>Lost <span className="kg-count">{outs.length}</span></h3>
          <p className="kb-sub">
            {data.stats.trackingSince ? `Removed from Hostaway · tracked since ${prettyDate(data.stats.trackingSince)}` : "Loss tracking starts once the Blob store is connected in Vercel"}
          </p>
          <FeedList items={outs} kind="out" empty={data.stats.trackingSince ? "No properties lost here." : "Not tracking losses yet."} />
        </section>
      </div>
    </>
  );
}

function FeedList({ items, kind, empty }: { items: Array<{ id: number; name: string; city?: string; date: string }>; kind: "in" | "out"; empty: string }) {
  if (items.length === 0) return <div className="kb-empty">{empty}</div>;
  return (
    <div className="kg-feed">
      {items.map((o) => (
        <div className="kg-row" key={`${o.id}-${o.date}`}>
          <span className={`kg-pill ${kind}`}>{kind === "in" ? "IN" : "OUT"}</span>
          <span className="kg-name">
            {o.name}
            {o.city && <span> · {o.city}</span>}
          </span>
          <span className="kg-date">{prettyDate(o.date)}</span>
        </div>
      ))}
    </div>
  );
}
