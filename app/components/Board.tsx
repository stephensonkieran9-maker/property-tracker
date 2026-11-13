"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import AreaPicker from "./AreaPicker";
import type { Board as BoardData, Problem, TargetProgress } from "@/lib/boardTypes";

// ── Formatting ──────────────────────────────────────────────
const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
const gbpShort = (n: number) =>
  n >= 1_000_000 ? `£${(n / 1_000_000).toFixed(2)}m` : n >= 10_000 ? `£${(n / 1000).toFixed(1)}k` : gbp(n);
const fmt = (n: number, f: TargetProgress["format"]) => (f === "gbp" ? gbpShort(n) : f === "pct" ? `${n}%` : n.toLocaleString("en-GB"));

function waited(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
}

function stampLabel(s: string | null, today: string): string {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const t = s.slice(11, 16);
  if (d === today) return `today ${t}`;
  const wd = new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return `${wd} ${t}`;
}

function greeting(stamp: string): string {
  const h = Number(stamp.slice(11, 13));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function heroLine(p: Problem | undefined, extra: number): string {
  if (!p) return "Inbox is clear. Nothing needs you right now.";
  const where = p.listingName ? ` at ${p.listingName.split("·").pop()!.trim()}` : "";
  const lead: Record<string, string> = {
    Access: `Guest can't get in${where}`,
    Maintenance: `Maintenance issue${where}`,
    Refund: `Refund request from ${p.guestName.split(" ")[0]}`,
    Complaint: `Unhappy guest${where}`,
    Cancellation: `Cancellation query${where}`,
    Noise: `Noise complaint${where}`,
    WiFi: `WiFi problem${where}`,
    Unanswered: `${p.guestName.split(" ")[0]} has waited ${waited(p.waitingMins)} for a reply`,
  };
  if (extra > 0) return `${lead[p.kind]}, and ${extra} more ${extra === 1 ? "issue needs" : "issues need"} you.`;
  return p.kind === "Unanswered" ? `${lead[p.kind]}.` : `${lead[p.kind]} needs you.`;
}

function shiftMonth(m: string, by: number): string {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

// ── Icons ───────────────────────────────────────────────────
const I = {
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  growth: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>,
  inbox: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/></svg>,
  target: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.5"/></svg>,
  speaker: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7"/></svg>,
};

// ── Main ────────────────────────────────────────────────────
export default function Board() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  const [group, setGroup] = useState("All");

  const load = useCallback(async (m: string | null, g: string) => {
    setBusy(true);
    try {
      const q = new URLSearchParams();
      if (m) q.set("month", m);
      if (g !== "All") q.set("group", g);
      const res = await fetch(`/api/board?${q}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load(month, group);
  }, [load, month, group]);

  // Refresh every 5 minutes.
  useEffect(() => {
    const t = setInterval(() => load(month, group), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load, month, group]);

  return (
    <div className="kb">
      <Sidebar active="overview" />

      <main className="kb-main">
        {!data && !error && <div className="kb-loading">Loading the board…</div>}
        {error && !data && <div className="kb-error">Couldn&apos;t load the board: {error}</div>}
        {data && (
          <div className={`kb-fade${busy ? " busy" : ""}`}>
            <Header data={data} group={group} setGroup={setGroup} error={error} />
            <Top data={data} />
            <div className="kb-grid kb-two">
              <NeedsYou data={data} />
              <Targets data={data} />
            </div>
            <Month data={data} setMonth={setMonth} />
            <div className="kb-grid kb-two">
              <Heatmap data={data} />
              <ByGroup data={data} />
            </div>
            <Portfolio data={data} />
          </div>
        )}
      </main>
    </div>
  );
}

// ── Sections ────────────────────────────────────────────────
function Header({ data, group, setGroup, error }: { data: BoardData; group: string; setGroup: (g: string) => void; error: string | null }) {
  const dateLabel = new Date(data.today + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
  return (
    <div className="kb-head">
      <div>
        <div className="kb-date">{dateLabel}</div>
        <h1 className="kb-hello">
          {greeting(data.generatedAt)}, <em>{data.greetingName}.</em>
        </h1>
      </div>
      <div className="kb-headr">
        {data.demo && <span className="kb-demo">DEMO DATA</span>}
        <span className="kb-updated">{error ? "Refresh failed · " : ""}Updated {data.generatedAt.slice(11, 16)}</span>
        <AreaPicker data={data} group={group} setGroup={setGroup} />
      </div>
    </div>
  );
}


function Top({ data }: { data: BoardData }) {
  const { tonight, today_, inbox } = data;
  const top = inbox.problems[0];
  const urgent = inbox.problems.filter((p) => p.unanswered && p.severity >= 2).length;
  const line = heroLine(top, Math.max(0, urgent - 1));
  const listen = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const parts = [line, ...inbox.problems.slice(0, 3).map((p) => `${p.kind}. ${p.guestName}: ${p.message}`)];
    const u = new SpeechSynthesisUtterance(parts.join(". "));
    u.lang = "en-GB";
    window.speechSynthesis.speak(u);
  };
  const delta = tonight.vsLastWeekPts;
  return (
    <div className="kb-grid kb-top">
      <div className="kb-hero">
        <span className="kb-hero-tag">Needs you now</span>
        <p>{line}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="kb-listen" onClick={listen}>{I.speaker} Listen</button>
          {top && (
            <a className="kb-listen" style={{ textDecoration: "none" }} href={`/inbox?view=all&c=${top.conversationId}`}>Open message →</a>
          )}
        </div>
      </div>
      <div className="kb-kpis">
        <div className="kb-kpi">
          <span className="kb-kpi-l">Occupancy tonight</span>
          <span className="kb-kpi-v">{tonight.occupancyPct}%</span>
          <span className="kb-kpi-s">{tonight.occupied} of {tonight.units} properties</span>
          <span className="kb-kpi-s">
            <span className={delta >= 0 ? "kb-up" : "kb-down"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts</span> on last {tonight.lastWeekDay}
          </span>
          <div className="kb-meter"><i style={{ width: `${tonight.occupancyPct}%` }} /></div>
        </div>
        <div className="kb-kpi">
          <span className="kb-kpi-l">Booked today</span>
          <span className="kb-kpi-v">{gbp(today_.revenue)}</span>
          <span className="kb-kpi-s">{today_.bookings} booked · {today_.cancelled} cancelled</span>
          <span className="kb-kpi-s">Last 24h: {gbp(today_.last24hRevenue)} ({today_.last24hBookings})</span>
        </div>
        <div className="kb-kpi">
          <span className="kb-kpi-l">Arriving today</span>
          <span className="kb-kpi-v">{tonight.arriving}</span>
          <span className="kb-kpi-s">{tonight.firstArrival ? `First at ${tonight.firstArrival}` : "No check-in times set"}</span>
        </div>
        <div className="kb-kpi">
          <span className="kb-kpi-l">Leaving today</span>
          <span className="kb-kpi-v">{tonight.leaving}</span>
          <span className="kb-kpi-s">Check-outs to turn over</span>
        </div>
        <a className="kb-kpi kb-click" href="/inbox?view=reply">
          <span className="kb-kpi-l">Unanswered</span>
          <span className="kb-kpi-v">{inbox.unanswered}</span>
          <span className="kb-kpi-s">Oldest {stampLabel(inbox.oldestUnanswered, data.today)}</span>
        </a>
        <a className="kb-kpi kb-click" href="/inbox?view=problems">
          <span className="kb-kpi-l">Problems flagged</span>
          <span className="kb-kpi-v">{inbox.problems.filter((p) => p.kind !== "Unanswered").length}</span>
          <span className="kb-kpi-s">
            <span className="kb-down">{inbox.problems.filter((p) => p.severity === 3).length} urgent</span> · from guest messages
          </span>
        </a>
      </div>
    </div>
  );
}

function NeedsYou({ data }: { data: BoardData }) {
  const ps = data.inbox.problems;
  return (
    <section className="kb-card">
      <div className="kb-cardhead">
        <div>
          <h3>Needs you</h3>
          <p className="kb-sub">Problems spotted in the guest inbox, most urgent first</p>
        </div>
        <a className="kb-link" href="/inbox?view=problems">Open inbox →</a>
      </div>
      <div className="kb-list">
        {ps.length === 0 && <div className="kb-empty">Nothing flagged. Nice.</div>}
        {ps.slice(0, 8).map((p) => (
          <a className="kb-row kb-row-link" key={p.conversationId} href={`/inbox?view=all&c=${p.conversationId}`}>
            <span className={`kb-dot s${p.severity}`} />
            <div className="kb-kind">
              <b>{p.kind}</b>
              {p.unanswered ? "Waiting on us" : "Replied"}
            </div>
            <div className="kb-msg">
              <div title={p.message}>{p.message}</div>
              <div className="who">
                {p.guestName}
                {p.listingName ? ` · ${p.listingName}` : ""}
              </div>
            </div>
            <div className={`kb-wait${p.unanswered && p.waitingMins > 60 ? " late" : ""}`}>{waited(p.waitingMins)} ago</div>
          </a>
        ))}
      </div>
    </section>
  );
}

function TargetRow({ team, label, actual, target, format, pace: p, status }: {
  team?: string; label: string; actual: number | null; target: number; format: TargetProgress["format"]; pace: number | null; status: string;
}) {
  const fill = actual === null ? 0 : Math.min(100, (actual / Math.max(1, target)) * 100);
  return (
    <div className="kb-target">
      {team && <div className="kb-target-team">{team}</div>}
      <div className="kb-target-top">
        <span>
          {label}
          <span className={`kb-status ${status}`}>{status === "on-track" ? "on track" : status === "pending" ? "no data yet" : status}</span>
        </span>
        <span className="kb-target-n">
          <b>{actual === null ? "—" : fmt(actual, format)}</b> / {fmt(target, format)}
        </span>
      </div>
      <div className="kb-bar">
        <i className={status} style={{ width: `${fill}%` }} />
        {p !== null && <u style={{ left: `${Math.min(100, (p / target) * 100)}%` }} />}
      </div>
    </div>
  );
}

function Targets({ data }: { data: BoardData }) {
  const { people } = data;
  return (
    <section className="kb-card">
      <div className="kb-cardhead">
        <h3>Team targets</h3>
        <a className="kb-link" href={`/targets${data.month.isCurrent ? "" : `?month=${data.month.key}`}`}>All targets →</a>
      </div>
      <p className="kb-sub">{data.month.label}{data.month.isCurrent ? " · marker = where we should be today" : ""}</p>
      <div className="kb-target-group">
        People
        <span>{people.source === "sheet" ? "from Google Sheet · updated daily" : people.error ? `Sheet not loading: ${people.error}` : "Google Sheet not connected yet"}</span>
      </div>
      {people.rows.map((r) => (
        <TargetRow key={r.person} team={r.team} label={r.person} actual={r.actual} target={r.target} format={r.format} pace={r.pace} status={r.status} />
      ))}
      <div className="kb-target-group">Company<span>live from Hostaway</span></div>
      {data.targets.map((t) => (
        <TargetRow key={t.label} team={t.team} label={t.label} actual={t.actual} target={t.target} format={t.format} pace={t.pace} status={t.status} />
      ))}
    </section>
  );
}

function Month({ data, setMonth }: { data: BoardData; setMonth: (m: string | null) => void }) {
  const m = data.month;
  const current = data.today.slice(0, 7);
  const vsPrev = m.prevMonthRevenue ? Math.round(((m.revenue - m.prevMonthRevenue) / m.prevMonthRevenue) * 100) : 0;
  return (
    <section className="kb-card kb-grid" style={{ display: "block" }}>
      <div className="kb-month-head">
        <div>
          <h3>Bookings &amp; revenue</h3>
          <p className="kb-sub" style={{ margin: 0 }}>By the date the booking was made · revenue is the booking total</p>
        </div>
        <div className="kb-picker">
          {!m.isCurrent && <button className="kb-today" onClick={() => setMonth(null)}>This month</button>}
          <button aria-label="Previous month" onClick={() => setMonth(shiftMonth(m.key, -1))}>‹</button>
          <span>{m.label}</span>
          <button aria-label="Next month" disabled={m.key >= current} onClick={() => setMonth(shiftMonth(m.key, 1))}>›</button>
        </div>
      </div>
      <div className="kb-mtiles">
        <div className="kb-kpi">
          <span className="kb-kpi-l">Bookings made</span>
          <span className="kb-kpi-v">{m.bookings}</span>
          <span className="kb-kpi-s">{m.cancelled} cancelled</span>
        </div>
        <div className="kb-kpi">
          <span className="kb-kpi-l">Revenue booked</span>
          <span className="kb-kpi-v">{gbpShort(m.revenue)}</span>
          <span className="kb-kpi-s">
            {m.prevMonthRevenue > 0 && <span className={vsPrev >= 0 ? "kb-up" : "kb-down"}>{vsPrev >= 0 ? "▲" : "▼"} {Math.abs(vsPrev)}%</span>} {m.isCurrent ? "vs same point last month" : "vs last month"}
          </span>
        </div>
        <div className="kb-kpi">
          <span className="kb-kpi-l">Running total</span>
          <span className="kb-kpi-v">{gbpShort(m.runningTotal)}</span>
          <span className="kb-kpi-s">{m.runningTotalLabel}</span>
        </div>
        <div className="kb-kpi">
          <span className="kb-kpi-l">Month occupancy</span>
          <span className="kb-kpi-v">{m.occupancyPct}%</span>
          <span className="kb-kpi-s">{m.nightsSold.toLocaleString("en-GB")} nights {m.isCurrent ? "on the books" : "sold"}</span>
        </div>
        <div className="kb-kpi">
          <span className="kb-kpi-l">Stay revenue · ADR</span>
          <span className="kb-kpi-v">{gbpShort(m.stayRevenue)}</span>
          <span className="kb-kpi-s">{gbp(m.adr)} avg nightly rate</span>
        </div>
      </div>
      <RevenueChart data={data} />
    </section>
  );
}

function RevenueChart({ data }: { data: BoardData }) {
  const m = data.month;
  const days = new Date(Date.UTC(+m.key.slice(0, 4), +m.key.slice(5, 7), 0)).getUTCDate();
  const W = 1000, H = 220, L = 52, R = 12, T = 12, B = 26;
  const maxCum = Math.max(m.revenueTarget, ...m.daily.map((d) => d.cumulative), 1) * 1.05;
  const maxDay = Math.max(...m.daily.map((d) => d.revenue), 1);
  const x = (i: number) => L + ((i + 0.5) / days) * (W - L - R);
  const y = (v: number) => T + (1 - v / maxCum) * (H - T - B);
  const line = m.daily.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.cumulative).toFixed(1)}`).join(" ");
  const area = m.daily.length ? `${line} L${x(m.daily.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxCum);
  const barW = Math.max(2, ((W - L - R) / days) * 0.55);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? m.daily[hover] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg className="kb-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="kbArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f2c14e" stopOpacity="0.28" />
            <stop offset="1" stopColor="#f2c14e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#26262a" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={L - 8} y={y(t) + 3} fill="#66666c" fontSize="10" textAnchor="end">{gbpShort(t)}</text>
          </g>
        ))}
        {m.daily.map((d, i) => {
          const bh = (d.revenue / maxDay) * (H - T - B) * 0.35;
          return <rect key={d.date} x={x(i) - barW / 2} y={y(0) - bh} width={barW} height={bh} rx="1.5" fill={hover === i ? "#9a9aa0" : "#3a3a40"} />;
        })}
        {m.revenueTarget > 0 && <line x1={x(0)} y1={y(0)} x2={x(days - 1)} y2={y(m.revenueTarget)} stroke="#9a9aa0" strokeDasharray="5 5" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
        {area && <path d={area} fill="url(#kbArea)" />}
        {line && <path d={line} fill="none" stroke="#f2c14e" strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        {m.daily.length > 0 && (
          <circle cx={x(m.daily.length - 1)} cy={y(m.daily[m.daily.length - 1].cumulative)} r="4" fill="#f2c14e" />
        )}
        {[1, 8, 15, 22, days].map((dd) => (
          <text key={dd} x={x(dd - 1)} y={H - 8} fill="#66666c" fontSize="10" textAnchor="middle">{dd}</text>
        ))}
        {m.daily.map((d, i) => (
          <rect key={"h" + d.date} x={x(i) - (W - L - R) / days / 2} y={T} width={(W - L - R) / days} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={y(0)} stroke="#66666c" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {h && (
        <div style={{ position: "absolute", top: 4, right: 8, background: "#1b1b1e", border: "1px solid #26262a", borderRadius: 8, padding: "6px 10px", fontSize: 11.5 }}>
          <b>{new Date(h.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</b>
          {" · "}{h.bookings} bookings · {gbp(h.revenue)} · running {gbp(h.cumulative)}
        </div>
      )}
      <div className="kb-legend">
        <span><i style={{ background: "#f2c14e" }} />Revenue booked, running total</span>
        {m.revenueTarget > 0 && <span><i style={{ background: "repeating-linear-gradient(90deg,#9a9aa0 0 4px,transparent 4px 7px)" }} />Target pace ({gbpShort(m.revenueTarget)})</span>}
        <span><i style={{ background: "#3a3a40", height: 8 }} />Booked per day</span>
      </div>
    </div>
  );
}

function cellStyle(pct: number, target: number): React.CSSProperties {
  if (pct < target) return { background: "#2a2a2e", color: "#8a8a90" };
  const t = Math.min(1, (pct - target) / (100 - target));
  const a = 0.45 + t * 0.55;
  return { background: `rgba(242,193,78,${a})`, color: a > 0.75 ? "#1a1406" : "#f6dfa3" };
}

const ROWS_SHOWN = 10;

function Heatmap({ data }: { data: BoardData }) {
  const { dates, rows, target } = data.next14;
  const [all, setAll] = useState(false);
  const cols = `minmax(120px, 190px) repeat(${dates.length}, minmax(0, 1fr))`;
  const shown = all ? rows : rows.slice(0, ROWS_SHOWN);
  const perProperty = rows[1]?.kind === "property";
  return (
    <section className="kb-card">
      <h3>Next 14 nights</h3>
      <p className="kb-sub">
        {perProperty
          ? "Each property, night by night: gold is booked, grey is empty. Top row is the area as a whole."
          : `% of properties booked each night. Top row is the whole portfolio; areas below, biggest first. Grey is under the ${target}% target.`}
      </p>
      <div className="kb-heat" style={{ gridTemplateColumns: cols }}>
        <span />
        {dates.map((d) => {
          const wd = new Date(d + "T12:00:00Z").getUTCDay();
          return (
            <span key={d} className={`kb-heat-d${wd === 5 || wd === 6 ? " we" : ""}`}>
              {new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }).slice(0, 2)}
              <br />
              {Number(d.slice(8))}
            </span>
          );
        })}
        {shown.map((r) => (
          <Row key={r.kind + r.group} row={r} target={target} />
        ))}
      </div>
      {rows.length > ROWS_SHOWN && (
        <button className="kb-more" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${rows.length - 1} ${perProperty ? "properties" : "areas"}`}
        </button>
      )}
    </section>
  );
}

function Row({ row, target }: { row: BoardData["next14"]["rows"][number]; target: number }) {
  const single = row.kind === "property";
  return (
    <>
      <span className={`kb-heat-l${row.kind === "total" ? " total" : ""}`} title={row.group}>
        {row.group}
        {row.kind !== "property" && <em>{row.units}</em>}
      </span>
      {row.pcts.map((p, i) => (
        <span
          key={i}
          className={`kb-cell${row.kind === "total" ? " total" : ""}`}
          style={single ? (p >= 100 ? { background: "rgba(242,193,78,0.9)", color: "#1a1406" } : { background: "#222225", color: "#55555b" }) : cellStyle(p, target)}
          title={single ? `${row.group}: ${p >= 100 ? "booked" : "empty"}` : `${row.group}: ${p}% of ${row.units}`}
        >
          {single ? "" : p}
        </span>
      ))}
    </>
  );
}

function ByGroup({ data }: { data: BoardData }) {
  const [all, setAll] = useState(false);
  const sorted = useMemo(
    () => [...data.tonight.byGroup].sort((a, b) => b.units - a.units || b.pct - a.pct || a.group.localeCompare(b.group)),
    [data]
  );
  const shown = all ? sorted : sorted.slice(0, 8);
  return (
    <section className="kb-card">
      <h3>Tonight by area</h3>
      <p className="kb-sub">Occupied properties tonight, biggest areas first</p>
      {shown.map((g) => (
        <div className="kb-bg-row" key={g.group}>
          <div className="kb-bg-top">
            <span>{g.group}</span>
            <span>{g.occupied} of {g.units} · {g.pct}%</span>
          </div>
          <div className="kb-meter" style={{ height: 5 }}>
            <i style={{ width: `${g.pct}%`, background: g.pct < data.next14.target ? "#66666c" : undefined }} />
          </div>
        </div>
      ))}
      {sorted.length > 8 && (
        <button className="kb-more" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${sorted.length} areas`}
        </button>
      )}
    </section>
  );
}

function Portfolio({ data }: { data: BoardData }) {
  const p = data.portfolio;
  return (
    <section className="kb-card kb-port">
      <div><b>{p.units}</b><span>Properties under management</span></div>
      <div><b className={p.onboardedThisMonth ? "kb-up" : ""}>{p.onboardedThisMonth ? `+${p.onboardedThisMonth}` : "0"}</b><span>Onboarded in {data.month.label.split(" ")[0]}</span></div>
      <div><b className={p.lostThisMonth ? "kb-down" : ""}>{p.lostThisMonth ? `−${p.lostThisMonth}` : "0"}</b><span>Lost in {data.month.label.split(" ")[0]}</span></div>
      <a className="kb-link" href="/growth">Portfolio growth &amp; losses →</a>
    </section>
  );
}
