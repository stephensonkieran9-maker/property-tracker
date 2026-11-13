"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "./Sidebar";
import type { Board, TargetProgress } from "@/lib/boardTypes";

type History = Record<string, Array<{ month: string; target: number; actual: number | null }>>;
type Fmt = TargetProgress["format"];

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
const short = (n: number) => (n >= 1_000_000 ? `£${(n / 1e6).toFixed(2)}m` : n >= 10_000 ? `£${(n / 1000).toFixed(1)}k` : gbp(n));
const fmt = (n: number, f: Fmt) => (f === "gbp" ? short(n) : f === "pct" ? `${n}%` : n.toLocaleString("en-GB"));
const fmtFull = (n: number, f: Fmt) => (f === "gbp" ? gbp(n) : f === "pct" ? `${n}%` : n.toLocaleString("en-GB"));

function shiftMonth(m: string, by: number): string {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm - 1 + by, 1)).toISOString().slice(0, 7);
}
const mShort = (m: string) => new Date(m + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

const STATUS: Record<string, string> = { ahead: "ahead", "on-track": "on track", behind: "behind", pending: "no data yet" };

export default function TargetsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const month = params.get("month");
  const [data, setData] = useState<Board | null>(null);
  const [hist, setHist] = useState<History>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (m: string | null) => {
    setBusy(true);
    try {
      const q = m ? `?month=${m}` : "";
      const [b, h] = await Promise.all([
        fetch(`/api/board${q}`, { cache: "no-store" }).then(async (r) => ({ ok: r.ok, j: await r.json() })),
        fetch(`/api/targets/history${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ history: {} })),
      ]);
      if (!b.ok) throw new Error(b.j.error || "Failed to load");
      setData(b.j);
      setHist(h.history ?? {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [load, month]);

  const go = (m: string | null) => router.replace(m ? `/targets?month=${m}` : "/targets", { scroll: false });

  return (
    <div className="kb">
      <Sidebar active="targets" />
      <main className="kb-main">
        {!data && !error && <div className="kb-loading">Loading targets…</div>}
        {error && !data && <div className="kb-error">Couldn&apos;t load targets: {error}</div>}
        {data && <Content data={data} hist={hist} busy={busy} go={go} />}
      </main>
    </div>
  );
}

function Content({ data, hist, busy, go }: { data: Board; hist: History; busy: boolean; go: (m: string | null) => void }) {
  const m = data.month;
  const current = data.today.slice(0, 7);
  const day = m.isCurrent ? Number(data.today.slice(8, 10)) : m.daysInMonth;
  const left = m.daysInMonth - day;
  const pctThrough = Math.round((day / m.daysInMonth) * 100);

  return (
    <div className={`kb-fade${busy ? " busy" : ""}`}>
      <div className="kb-head">
        <div>
          <div className="kb-date">
            {m.isCurrent ? `Day ${day} of ${m.daysInMonth} · ${pctThrough}% through the month · ${left} days left` : `${m.label} · final numbers`}
          </div>
          <h1 className="kb-hello">
            Team <em>targets.</em>
          </h1>
        </div>
        <div className="kb-headr">
          {data.demo && <span className="kb-demo">DEMO DATA</span>}
          <div className="kb-picker">
            {!m.isCurrent && <button className="kb-today" onClick={() => go(null)}>This month</button>}
            <button aria-label="Previous month" onClick={() => go(shiftMonth(m.key, -1))}>‹</button>
            <span>{m.label}</span>
            <button aria-label="Next month" disabled={m.key >= current} onClick={() => go(shiftMonth(m.key, 1))}>›</button>
          </div>
        </div>
      </div>

      <div className="kt-section">
        <h2>People</h2>
        <span>
          {data.people.source === "sheet"
            ? "From the Google Sheet · refreshed daily"
            : data.people.error
              ? `Google Sheet not loading (${data.people.error}) · showing default targets`
              : "Google Sheet not connected yet · targets set, actuals will appear once it is"}
        </span>
      </div>
      <div className="kt-people">
        {data.people.rows.map((p) => (
          <PersonCard key={p.person} p={p} history={hist[p.person] ?? []} isCurrent={m.isCurrent} daysLeft={left} />
        ))}
      </div>

      <div className="kt-section">
        <h2>Company</h2>
        <span>Live from Hostaway · whole portfolio</span>
      </div>
      <div className="kt-company">
        {data.targets.map((t) => (
          <CompanyCard key={t.label} t={t} data={data} daysLeft={left} />
        ))}
      </div>
    </div>
  );
}

function Bar({ actual, target, pace, status }: { actual: number | null; target: number; pace: number | null; status: string }) {
  const fill = actual === null ? 0 : Math.min(100, (actual / Math.max(1, target)) * 100);
  return (
    <div className="kb-bar" style={{ height: 8 }}>
      <i className={status} style={{ width: `${fill}%` }} />
      {pace !== null && <u style={{ left: `${Math.min(100, (pace / Math.max(1, target)) * 100)}%` }} />}
    </div>
  );
}

function PersonCard({ p, history, isCurrent, daysLeft }: {
  p: Board["people"]["rows"][number]; history: History[string]; isCurrent: boolean; daysLeft: number;
}) {
  const pctDone = p.actual === null ? null : Math.round((p.actual / Math.max(1, p.target)) * 100);
  const remaining = p.actual === null ? null : Math.max(0, p.target - p.actual);
  let line: string;
  if (p.actual === null) line = "Waiting for this month's actual in the sheet.";
  else if (remaining === 0) line = `Target hit: ${fmtFull(p.actual - p.target, p.format)} over.`;
  else if (!isCurrent) line = `Finished at ${pctDone}% of target.`;
  else if (daysLeft > 0) line = `${fmtFull(remaining!, p.format)} to go · ${fmtFull(Math.ceil(remaining! / daysLeft), p.format)} a day for ${daysLeft} days.`;
  else line = `${fmtFull(remaining!, p.format)} short on the last day.`;
  const maxH = Math.max(1, ...history.map((h) => Math.max(h.target, h.actual ?? 0)));

  return (
    <section className="kb-card kt-card">
      <div className="kt-card-top">
        <div>
          <div className="kb-target-team">{p.team ?? "Monthly target"}</div>
          <h3 className="kt-name">{p.person}</h3>
        </div>
        <span className={`kb-status ${p.status}`}>{STATUS[p.status]}</span>
      </div>
      <div className="kt-big">
        <b className={p.actual === null ? "none" : ""}>{p.actual === null ? "—" : fmt(p.actual, p.format)}</b>
        <span>of {fmt(p.target, p.format)}{pctDone !== null ? ` · ${pctDone}%` : ""}</span>
      </div>
      <Bar actual={p.actual} target={p.target} pace={p.pace} status={p.status} />
      <p className="kt-line">{line}</p>
      {history.length > 1 && history.some((h) => h.actual !== null) && (
        <div className="kt-hist" title="Last 6 months: bar = actual, line = target">
          {history.map((h) => (
            <div key={h.month} className="kt-hist-col">
              <div className="kt-hist-bar">
                <i
                  className={h.actual !== null && h.actual >= h.target ? "hit" : ""}
                  style={{ height: `${((h.actual ?? 0) / maxH) * 100}%` }}
                />
                <u style={{ bottom: `${(h.target / maxH) * 100}%` }} />
              </div>
              <span>{mShort(h.month)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CompanyCard({ t, data, daysLeft }: { t: TargetProgress; data: Board; daysLeft: number }) {
  const m = data.month;
  const metricChart = () => {
    if (t.label.toLowerCase().includes("revenue")) {
      return <CumChart values={m.daily.map((d) => d.cumulative)} days={m.daysInMonth} target={t.target} money />;
    }
    if (t.label.toLowerCase().includes("bookings")) {
      let c = 0;
      return <CumChart values={m.daily.map((d) => (c += d.bookings))} days={m.daysInMonth} target={t.target} />;
    }
    if (t.format === "pct") return <NightBars nightly={m.nightly} target={t.target} />;
    if (t.label.toLowerCase().includes("onboard")) {
      return m.onboardedUnits.length ? (
        <div className="kt-list">
          {m.onboardedUnits.map((u) => (
            <div key={u.name + u.date}>
              <span>{u.name}</span>
              <em>{u.group} · {new Date(u.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</em>
            </div>
          ))}
        </div>
      ) : (
        <div className="kb-empty">No properties onboarded yet this month.</div>
      );
    }
    if (t.lowerIsBetter) {
      return (
        <a className="kb-link" style={{ marginLeft: 0 }} href="/inbox?view=reply">
          Open the messages waiting for a reply →
        </a>
      );
    }
    return null;
  };

  let line = "";
  if (t.lowerIsBetter) line = t.actual <= t.target ? `Within the limit of ${t.target}.` : `${t.actual - t.target} over the limit right now.`;
  else if (t.format === "pct") line = t.actual >= t.target ? "At or above target." : `${t.target - t.actual} points under target.`;
  else if (t.actual >= t.target) line = "Target hit.";
  else if (m.isCurrent && daysLeft > 0) {
    const rem = t.target - t.actual;
    line = `${fmtFull(rem, t.format)} to go · ${fmtFull(Math.ceil(rem / daysLeft), t.format)} a day for ${daysLeft} days.`;
  } else line = `Finished at ${Math.round((t.actual / Math.max(1, t.target)) * 100)}% of target.`;

  return (
    <section className="kb-card kt-card">
      <div className="kt-card-top">
        <div>
          <div className="kb-target-team">{t.team}</div>
          <h3 className="kt-name sm">{t.label}</h3>
        </div>
        <span className={`kb-status ${t.status}`}>{STATUS[t.status]}</span>
      </div>
      <div className="kt-big">
        <b>{fmt(t.actual, t.format)}</b>
        <span>{t.lowerIsBetter ? "max" : "of"} {fmt(t.target, t.format)}</span>
      </div>
      <Bar actual={t.actual} target={t.target} pace={t.pace} status={t.status} />
      <p className="kt-line">{line}</p>
      <div className="kt-chart">{metricChart()}</div>
    </section>
  );
}

function CumChart({ values, days, target, money = false }: { values: number[]; days: number; target: number; money?: boolean }) {
  const W = 600, H = 140, L = 58, R = 8, T = 8, B = 18;
  const max = Math.max(target, ...values, 1) * 1.05;
  const x = (i: number) => L + ((i + 0.5) / days) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lab = (v: number) => (money ? short(v) : Math.round(v).toLocaleString("en-GB"));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="kt-svg" preserveAspectRatio="none">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(f * max)} y2={y(f * max)} stroke="#26262a" vectorEffect="non-scaling-stroke" />
          <text x={L - 6} y={y(f * max) + 3} fontSize="12" fill="#66666c" textAnchor="end">{lab(f * max)}</text>
        </g>
      ))}
      <line x1={x(0)} y1={y(0)} x2={x(days - 1)} y2={y(target)} stroke="#9a9aa0" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      {values.length > 0 && <path d={line} fill="none" stroke="#f2c14e" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      {values.length > 0 && <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3.5" fill="#f2c14e" />}
      {[1, Math.ceil(days / 2), days].map((d) => (
        <text key={d} x={x(d - 1)} y={H - 4} fontSize="12" fill="#66666c" textAnchor="middle">{d}</text>
      ))}
    </svg>
  );
}

function NightBars({ nightly, target }: { nightly: Board["month"]["nightly"]; target: number }) {
  const W = 600, H = 140, L = 30, R = 8, T = 8, B = 18;
  const n = nightly.length;
  const bw = ((W - L - R) / n) * 0.7;
  const x = (i: number) => L + ((i + 0.5) / n) * (W - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="kt-svg" preserveAspectRatio="none">
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#26262a" vectorEffect="non-scaling-stroke" />
          <text x={L - 6} y={y(v) + 3} fontSize="12" fill="#66666c" textAnchor="end">{v}</text>
        </g>
      ))}
      {nightly.map((d, i) => (
        <rect
          key={d.date}
          x={x(i) - bw / 2}
          y={y(d.pct)}
          width={bw}
          height={y(0) - y(d.pct)}
          rx="1.5"
          fill={d.pct >= target ? "#f2c14e" : "#4a4a50"}
          opacity={d.future ? 0.45 : 1}
        >
          <title>{`${d.date}: ${d.pct}%${d.future ? " (on the books)" : ""}`}</title>
        </rect>
      ))}
      <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} stroke="#9a9aa0" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      {[1, Math.ceil(n / 2), n].map((d) => (
        <text key={d} x={x(d - 1)} y={H - 4} fontSize="12" fill="#66666c" textAnchor="middle">{d}</text>
      ))}
    </svg>
  );
}
