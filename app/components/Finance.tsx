"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "./Sidebar";
import AreaPicker from "./AreaPicker";
import type { Finance as FinanceData, FinanceTotals } from "@/lib/finance";

// Channel colours: fixed order, validated for colour-blind separation and contrast on the dark card.
const CHANNEL_COLOURS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];
// Each channel keeps its colour whatever its rank or the period shown.
const KNOWN = ["airbnb", "booking.com", "vrbo", "direct", "corporate"];
function channelColour(name: string, all: string[]): string {
  const k = KNOWN.indexOf(name.toLowerCase());
  if (k >= 0) return CHANNEL_COLOURS[k];
  if (name === "Other") return "#8a8a90";
  const others = all.filter((n) => !KNOWN.includes(n.toLowerCase()) && n !== "Other").sort();
  return others.indexOf(name) === 0 ? CHANNEL_COLOURS[5] : "#8a8a90";
}

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
const short = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `£${(n / 1e6).toFixed(2)}m` : Math.abs(n) >= 10_000 ? `£${(n / 1000).toFixed(1)}k` : gbp(n);
const mShort = (m: string) => new Date(m + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
const mLong = (m: string) => new Date(m + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function change(now: number, before: number): { txt: string; up: boolean } | null {
  if (!before) return null;
  const p = Math.round(((now - before) / before) * 100);
  return { txt: `${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}%`, up: p >= 0 };
}

function shiftKey(period: string, key: string, by: number): string {
  if (period === "year") return String(Number(key) + by);
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

export default function Finance() {
  const router = useRouter();
  const params = useSearchParams();
  const period = params.get("period") === "year" ? "year" : "month";
  const basis = params.get("basis") === "booking" ? "booking" : "stay";
  const key = params.get("key");
  const group = params.get("group") ?? "All";

  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = useCallback(
    (changes: Record<string, string | null>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) p.delete(k);
        else p.set(k, v);
      }
      router.replace(`/finance?${p.toString()}`, { scroll: false });
    },
    [params, router]
  );

  useEffect(() => {
    let live = true;
    setBusy(true);
    const q = new URLSearchParams({ period, basis });
    if (key) q.set("key", key);
    if (group !== "All") q.set("group", group);
    fetch(`/api/finance?${q}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => {
        if (!live) return;
        if (!ok) throw new Error(j.error || "Failed to load");
        setData(j);
        setError(null);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [period, basis, key, group]);

  return (
    <div className="kb">
      <Sidebar active="finance" />
      <main className="kb-main">
        {!data && !error && <div className="kb-loading">Loading the numbers…</div>}
        {error && !data && <div className="kb-error">Couldn&apos;t load finance: {error}</div>}
        {data && (
          <div className={`kb-fade${busy ? " busy" : ""}`}>
            <Head data={data} set={set} />
            <Kpis t={data.totals} prev={data.previous} data={data} />
            <Trend data={data} onPick={(m) => set({ period: "month", key: m })} />
            <div className="kb-grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
              <Channels data={data} />
              <Areas data={data} />
            </div>
            <div className="kb-grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
              {data.period === "month" ? <Daily data={data} /> : <RateTrend data={data} />}
              <Forward data={data} />
            </div>
            <Properties data={data} />
          </div>
        )}
      </main>
    </div>
  );
}

function Head({ data, set }: { data: FinanceData; set: (c: Record<string, string | null>) => void }) {
  const nowKey = data.period === "year" ? data.today.slice(0, 4) : data.today.slice(0, 7);
  return (
    <>
      <div className="kb-head">
        <div>
          <div className="kb-date">
            {data.basis === "stay"
              ? "Earned: each booking's value spread across the nights it covers"
              : "Sold: each booking's full value on the day it was booked"}
          </div>
          <h1 className="kb-hello">
            <em>Finance.</em>
          </h1>
        </div>
        <div className="kb-headr">
          {data.demo && <span className="kb-demo">DEMO DATA</span>}
          <AreaPicker data={data} group={data.group} setGroup={(g) => set({ group: g === "All" ? null : g })} />
        </div>
      </div>
      <div className="kf-controls">
        <div className="kb-pills">
          <button className={`kb-pill${data.period === "month" ? " on" : ""}`} onClick={() => set({ period: "month", key: null })}>Month</button>
          <button className={`kb-pill${data.period === "year" ? " on" : ""}`} onClick={() => set({ period: "year", key: null })}>Year</button>
        </div>
        <div className="kb-picker">
          <button aria-label="Previous" onClick={() => set({ key: shiftKey(data.period, data.key, -1) })}>‹</button>
          <span>{data.label}</span>
          <button aria-label="Next" disabled={data.key >= nowKey} onClick={() => set({ key: shiftKey(data.period, data.key, 1) })}>›</button>
          {data.key !== nowKey && <button className="kb-today" onClick={() => set({ key: null })}>{data.period === "year" ? "This year" : "This month"}</button>}
        </div>
        <div className="kb-pills" style={{ marginLeft: "auto" }}>
          <button className={`kb-pill${data.basis === "stay" ? " on" : ""}`} onClick={() => set({ basis: null })} title="Revenue counted on the nights stayed">Earned (by stay)</button>
          <button className={`kb-pill${data.basis === "booking" ? " on" : ""}`} onClick={() => set({ basis: "booking" })} title="Revenue counted on the day it was booked">Sold (by booking date)</button>
        </div>
      </div>
      {data.includesFuture && (
        <p className="kf-note">Includes nights later in the period that are already booked. The figure will grow as more bookings come in.</p>
      )}
    </>
  );
}

function Kpis({ t, prev, data }: { t: FinanceTotals; prev: FinanceData["previous"]; data: FinanceData }) {
  const p = prev.totals;
  const tile = (label: string, value: string, now: number, before: number, sub?: string, lowerBetter = false) => {
    const c = change(now, before);
    const good = c ? (lowerBetter ? !c.up : c.up) : true;
    return (
      <div className="kb-kpi">
        <span className="kb-kpi-l">{label}</span>
        <span className="kb-kpi-v">{value}</span>
        <span className="kb-kpi-s">
          {c && <span className={good ? "kb-up" : "kb-down"}>{c.txt} </span>}
          {sub ?? `vs ${prev.label}`}
        </span>
      </div>
    );
  };
  return (
    <>
      <div className="kb-kpis kb-kpis-6" style={{ marginBottom: 10 }}>
        {tile("Revenue", short(t.revenue), t.revenue, p.revenue)}
        {t.net !== null
          ? tile("After channel commission", short(t.net), t.net, p.net ?? 0, `${short(t.commission ?? 0)} commission (${t.revenue ? Math.round(((t.commission ?? 0) / t.revenue) * 100) : 0}%)`)
          : (
            <div className="kb-kpi">
              <span className="kb-kpi-l">After channel commission</span>
              <span className="kb-kpi-v" style={{ color: "var(--k-faint)" }}>—</span>
              <span className="kb-kpi-s">Hostaway isn&apos;t sending commission</span>
            </div>
          )}
        {tile("Average nightly rate", gbp(t.adr), t.adr, p.adr)}
        {tile("Revenue per available night", gbp(t.revpar), t.revpar, p.revpar)}
        {tile("Occupancy", `${t.occupancyPct}%`, t.occupancyPct, p.occupancyPct)}
        {tile("Average booking value", gbp(t.avgBookingValue), t.avgBookingValue, p.avgBookingValue)}
      </div>
      <div className="kf-strip">
        <div><b>{t.nights.toLocaleString("en-GB")}</b><span>Nights {data.basis === "stay" ? "stayed" : "sold"}</span></div>
        <div><b>{t.bookings.toLocaleString("en-GB")}</b><span>Bookings</span></div>
        <div><b>{t.avgStay}</b><span>Average stay (nights)</span></div>
        <div><b>{t.avgLeadDays} days</b><span>Average booking lead time</span></div>
        <div><b>{t.cleaning === null ? "—" : short(t.cleaning)}</b><span>Cleaning fees</span></div>
        <div><b className={t.cancelledCount ? "kb-down" : ""}>{t.cancelledCount} · {short(t.cancelledValue)}</b><span>Cancelled in the period</span></div>
        {t.keaprFee !== null && (
          <div><b className="kb-up">{short(t.keaprFee)}</b><span>Keapr fee ({data.feePct}% est.)</span></div>
        )}
      </div>
    </>
  );
}

function Trend({ data, onPick }: { data: FinanceData; onPick: (m: string) => void }) {
  const pts = data.monthly;
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 250, L = 56, R = 10, T = 14, B = 26;
  const max = Math.max(1, ...pts.map((p) => Math.max(p.revenue, p.lastYear ?? 0))) * 1.08;
  const n = pts.length || 1;
  const slot = (W - L - R) / n;
  const bw = Math.min(46, slot * 0.6);
  const x = (i: number) => L + slot * (i + 0.5);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const hasLY = pts.some((p) => p.lastYear !== null);
  const sel = data.period === "month" ? data.key : null;
  const h = hover !== null ? pts[hover] : null;

  return (
    <section className="kb-card" style={{ marginBottom: 14 }}>
      <div className="kb-cardhead">
        <div>
          <h3>Revenue by month</h3>
          <p className="kb-sub">{data.period === "year" ? `Each month of ${data.key}` : "The 12 months to " + mLong(data.key)} · click a month to open it</p>
        </div>
        <div className="kb-legend" style={{ marginTop: 0 }}>
          <span><i style={{ background: "#f2c14e", height: 8 }} />Revenue</span>
          {hasLY && <span><i style={{ background: "#c3c2b7" }} />Same month last year</span>}
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <svg className="kb-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 250 }} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={W - R} y1={y(f * max)} y2={y(f * max)} stroke="#26262a" vectorEffect="non-scaling-stroke" />
              <text x={L - 8} y={y(f * max) + 3} fill="#66666c" fontSize="11" textAnchor="end">{short(f * max)}</text>
            </g>
          ))}
          {pts.map((p, i) => {
            const future = p.month > data.today.slice(0, 7);
            const top = y(p.revenue);
            const hgt = Math.max(0, y(0) - top);
            const r = Math.min(4, hgt / 2, bw / 2);
            // Bar with rounded top corners, square at the baseline.
            const d = `M${x(i) - bw / 2},${y(0)} V${top + r} Q${x(i) - bw / 2},${top} ${x(i) - bw / 2 + r},${top} H${x(i) + bw / 2 - r} Q${x(i) + bw / 2},${top} ${x(i) + bw / 2},${top + r} V${y(0)} Z`;
            return (
              <g key={p.month} style={{ cursor: "pointer" }} onClick={() => onPick(p.month)} onMouseEnter={() => setHover(i)}>
                <rect x={x(i) - slot / 2} y={T} width={slot} height={H - T - B} fill="transparent" />
                <path d={d} fill="#f2c14e" opacity={(sel && p.month !== sel) || future ? 0.55 : hover === i ? 1 : 0.9} />
                {p.lastYear !== null && (
                  <line x1={x(i) - bw / 2 - 4} x2={x(i) + bw / 2 + 4} y1={y(p.lastYear)} y2={y(p.lastYear)} stroke="#c3c2b7" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                )}
                <text x={x(i)} y={H - 8} fill={p.month === sel ? "#ededed" : "#66666c"} fontSize="11" textAnchor="middle">{mShort(p.month)}</text>
              </g>
            );
          })}
        </svg>
        {h && (
          <div className="kb-tip">
            <b>{mLong(h.month)}</b> · {gbp(h.revenue)}
            {h.lastYear !== null && <> · last year {gbp(h.lastYear)}</>}
            {" · "}{h.nights.toLocaleString("en-GB")} nights · {h.occupancyPct}% occupancy · {gbp(h.adr)} a night
          </div>
        )}
      </div>
    </section>
  );
}

function HBars({ rows, colour }: {
  rows: Array<{ name: string; value: number; colour?: string; right: string; sub?: string }>;
  colour?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="kf-hbars">
      {rows.map((r) => (
        <div key={r.name} className="kf-hbar">
          <div className="kf-hbar-top">
            <span>
              {r.colour && <i className="kf-swatch" style={{ background: r.colour }} />}
              {r.name}
            </span>
            <span>{r.right}</span>
          </div>
          <div className="kf-track">
            <i style={{ width: `${(r.value / max) * 100}%`, background: r.colour ?? colour ?? "#f2c14e" }} />
          </div>
          {r.sub && <div className="kf-hbar-sub">{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function Channels({ data }: { data: FinanceData }) {
  const total = data.channels.reduce((s, c) => s + c.revenue, 0) || 1;
  // Six colours max; anything past five folds into "Other".
  const top = data.channels.slice(0, 5);
  const rest = data.channels.slice(5);
  const names = data.channels.map((c) => c.name);
  const rows = rest.length
    ? [...top, { name: "Other", revenue: rest.reduce((s, c) => s + c.revenue, 0), bookings: rest.reduce((s, c) => s + c.bookings, 0), commission: null }]
    : top;
  return (
    <section className="kb-card">
      <h3>Revenue by channel</h3>
      <p className="kb-sub">Where the money comes from, with commission each channel takes</p>
      {rows.length === 0 ? (
        <div className="kb-empty">No bookings in this period.</div>
      ) : (
        <>
          <div className="kf-stack" aria-hidden>
            {rows.map((c) => (
              <i key={c.name} style={{ width: `${(c.revenue / total) * 100}%`, background: channelColour(c.name, names) }} title={`${c.name}: ${Math.round((c.revenue / total) * 100)}%`} />
            ))}
          </div>
          <HBars
            rows={rows.map((c) => ({
              name: c.name,
              value: c.revenue,
              colour: channelColour(c.name, names),
              right: `${short(c.revenue)} · ${Math.round((c.revenue / total) * 100)}%`,
              sub:
                `${c.bookings} bookings` +
                (c.commission !== null ? ` · ${short(c.commission)} commission (${c.revenue ? Math.round((c.commission / c.revenue) * 100) : 0}%)` : ""),
            }))}
          />
        </>
      )}
    </section>
  );
}

function Areas({ data }: { data: FinanceData }) {
  const [all, setAll] = useState(false);
  const rows = all ? data.areas : data.areas.slice(0, 7);
  return (
    <section className="kb-card">
      <h3>Revenue by area</h3>
      <p className="kb-sub">Biggest earners first, with occupancy and nightly rate</p>
      <HBars
        rows={rows.map((a) => ({
          name: a.name,
          value: a.revenue,
          right: short(a.revenue),
          sub: `${a.units} ${a.units === 1 ? "property" : "properties"} · ${a.occupancyPct}% occupancy · ${gbp(a.adr)} a night`,
        }))}
      />
      {data.areas.length > 7 && (
        <button className="kb-more" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${data.areas.length} areas`}</button>
      )}
    </section>
  );
}

function Daily({ data }: { data: FinanceData }) {
  const pts = data.daily;
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 190, L = 50, R = 8, T = 10, B = 22;
  const days = Number(data.key.slice(5, 7)) ? new Date(Date.UTC(+data.key.slice(0, 4), +data.key.slice(5, 7), 0)).getUTCDate() : 30;
  const max = Math.max(1, ...pts.map((p) => p.revenue)) * 1.1;
  const slot = (W - L - R) / days;
  const x = (i: number) => L + slot * (i + 0.5);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const h = hover !== null ? pts[hover] : null;
  return (
    <section className="kb-card">
      <h3>Revenue by day</h3>
      <p className="kb-sub">{data.basis === "stay" ? "Earned each night; faded bars are nights booked but not yet stayed" : "Booked each day"}</p>
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="kt-svg" style={{ height: 190 }} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={W - R} y1={y(f * max)} y2={y(f * max)} stroke="#26262a" vectorEffect="non-scaling-stroke" />
              <text x={L - 6} y={y(f * max) + 3} fontSize="11" fill="#66666c" textAnchor="end">{short(f * max)}</text>
            </g>
          ))}
          {pts.map((p, i) => (
            <g key={p.date} onMouseEnter={() => setHover(i)}>
              <rect x={x(i) - slot / 2} y={T} width={slot} height={H - T - B} fill="transparent" />
              <rect x={x(i) - slot * 0.32} y={y(p.revenue)} width={slot * 0.64} height={Math.max(0, y(0) - y(p.revenue))} rx="2" fill="#f2c14e" opacity={p.date > data.today ? 0.4 : hover === i ? 1 : 0.85} />
            </g>
          ))}
          {[1, Math.ceil(days / 2), days].map((d) => (
            <text key={d} x={x(d - 1)} y={H - 6} fontSize="11" fill="#66666c" textAnchor="middle">{d}</text>
          ))}
        </svg>
        {h && <div className="kb-tip"><b>{new Date(h.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</b> · {gbp(h.revenue)}</div>}
      </div>
    </section>
  );
}

function RateTrend({ data }: { data: FinanceData }) {
  // Two separate small charts (one scale each) rather than a dual-axis chart.
  const pts = data.monthly;
  const W = 600, H = 90, L = 50, R = 8, T = 8, B = 18;
  const slot = (W - L - R) / Math.max(1, pts.length);
  const x = (i: number) => L + slot * (i + 0.5);
  const maxAdr = Math.max(1, ...pts.map((p) => p.adr)) * 1.1;
  const yA = (v: number) => T + (1 - v / maxAdr) * (H - T - B);
  const yO = (v: number) => T + (1 - v / 100) * (H - T - B);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${yA(p.adr)}`).join(" ");
  return (
    <section className="kb-card">
      <h3>Nightly rate and occupancy</h3>
      <p className="kb-sub">Month by month across {data.key}</p>
      <div className="kf-mini-l">Average nightly rate</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="kt-svg" style={{ height: 90 }} preserveAspectRatio="none">
        {[0, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={yA(f * maxAdr)} y2={yA(f * maxAdr)} stroke="#26262a" vectorEffect="non-scaling-stroke" />
            <text x={L - 6} y={yA(f * maxAdr) + 3} fontSize="11" fill="#66666c" textAnchor="end">{gbp(f * maxAdr)}</text>
          </g>
        ))}
        <path d={line} fill="none" stroke="#f2c14e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => <circle key={p.month} cx={x(i)} cy={yA(p.adr)} r="3" fill="#f2c14e"><title>{`${mShort(p.month)}: ${gbp(p.adr)}`}</title></circle>)}
      </svg>
      <div className="kf-mini-l">Occupancy</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="kt-svg" style={{ height: 90 }} preserveAspectRatio="none">
        {[0, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={yO(v)} y2={yO(v)} stroke="#26262a" vectorEffect="non-scaling-stroke" />
            <text x={L - 6} y={yO(v) + 3} fontSize="11" fill="#66666c" textAnchor="end">{v}%</text>
          </g>
        ))}
        {pts.map((p, i) => (
          <rect key={p.month} x={x(i) - slot * 0.3} y={yO(p.occupancyPct)} width={slot * 0.6} height={yO(0) - yO(p.occupancyPct)} rx="2" fill="#8a8a90">
            <title>{`${mShort(p.month)}: ${p.occupancyPct}%`}</title>
          </rect>
        ))}
        {pts.map((p, i) => <text key={"l" + p.month} x={x(i)} y={H - 4} fontSize="11" fill="#66666c" textAnchor="middle">{mShort(p.month)}</text>)}
      </svg>
    </section>
  );
}

function Forward({ data }: { data: FinanceData }) {
  const max = Math.max(1, ...data.forward.map((f) => f.revenue));
  const total = data.forward.reduce((s, f) => s + f.revenue, 0);
  return (
    <section className="kb-card">
      <div className="kb-cardhead">
        <div>
          <h3>On the books</h3>
          <p className="kb-sub">Revenue already booked for upcoming stays{data.group !== "All" ? ` in ${data.group}` : ""}</p>
        </div>
        <div className="kf-total">{short(total)}<span>next 6 months</span></div>
      </div>
      <div className="kf-fwd">
        {data.forward.map((f, i) => (
          <div key={f.month} className="kf-fwd-col" title={`${i === 0 ? "Rest of " : ""}${mLong(f.month)}: ${gbp(f.revenue)} booked, ${f.occupancyPct}% of nights`}>
            <span className="kf-fwd-v">{short(f.revenue)}</span>
            <div className="kf-fwd-bar"><i style={{ height: `${(f.revenue / max) * 100}%` }} /></div>
            <span className="kf-fwd-m">{i === 0 ? "Rest of " + mShort(f.month) : mShort(f.month)}</span>
            <span className="kf-fwd-o">{f.occupancyPct}% booked</span>
          </div>
        ))}
      </div>
    </section>
  );
}

type SortKey = "revenue" | "nights" | "occupancyPct" | "adr" | "name";

function Properties({ data }: { data: FinanceData }) {
  const [sort, setSort] = useState<SortKey>("revenue");
  const [asc, setAsc] = useState(false);
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = data.properties.filter((p) => !t || p.name.toLowerCase().includes(t) || p.area.toLowerCase().includes(t));
    list.sort((a, b) => {
      const v = sort === "name" ? a.name.localeCompare(b.name) : (a[sort] as number) - (b[sort] as number);
      return asc ? v : -v;
    });
    return list;
  }, [data.properties, sort, asc, q]);
  const shown = all ? rows : rows.slice(0, 15);
  const head = (k: SortKey, label: string, right = true) => (
    <th className={right ? "r" : ""}>
      <button onClick={() => (sort === k ? setAsc(!asc) : (setSort(k), setAsc(k === "name")))}>
        {label}{sort === k ? (asc ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  const csv = () => {
    const lines = [["Property", "Area", "Revenue", "Nights", "Occupancy %", "Nightly rate"], ...rows.map((p) => [p.name, p.area, p.revenue, p.nights, p.occupancyPct, p.adr])];
    const text = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `keapr-properties-${data.key}-${data.basis}.csv`;
    a.click();
  };
  return (
    <section className="kb-card" style={{ marginTop: 14 }}>
      <div className="kb-cardhead" style={{ marginBottom: 10 }}>
        <div>
          <h3>Properties</h3>
          <p className="kb-sub" style={{ margin: 0 }}>{data.label} · click a column to sort</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="kg-search" placeholder="Search properties or areas…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="kb-area-btn" onClick={csv}>Download CSV</button>
        </div>
      </div>
      <table className="kf-table">
        <thead>
          <tr>
            {head("name", "Property", false)}
            <th>Area</th>
            {head("revenue", "Revenue")}
            {head("nights", "Nights")}
            {head("occupancyPct", "Occupancy")}
            {head("adr", "Nightly rate")}
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id}>
              <td className="name">{p.name}</td>
              <td className="muted">{p.area}</td>
              <td className="r">{gbp(p.revenue)}</td>
              <td className="r">{p.nights}</td>
              <td className="r">
                <span className="kf-occ"><i style={{ width: `${p.occupancyPct}%` }} /></span>
                {p.occupancyPct}%
              </td>
              <td className="r">{p.adr ? gbp(p.adr) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 15 && (
        <button className="kb-more" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${rows.length} properties`}</button>
      )}
    </section>
  );
}
