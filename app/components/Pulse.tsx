"use client";

// "How we're doing": one phone screen with the numbers that matter today.
import { useCallback, useEffect, useState } from "react";
import { cachedOnSwitch, readCache, warmOtherPages, writeCache } from "@/lib/clientCache";
import type { Board, TargetProgress } from "@/lib/boardTypes";

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
const short = (n: number) => (n >= 1_000_000 ? `£${(n / 1e6).toFixed(2)}m` : n >= 10_000 ? `£${(n / 1000).toFixed(1)}k` : gbp(n));
const fmt = (n: number, f: TargetProgress["format"]) => (f === "gbp" ? short(n) : f === "pct" ? `${n}%` : n.toLocaleString("en-GB"));
const STATUS: Record<string, string> = { ahead: "Ahead", "on-track": "On track", behind: "Behind", pending: "No data" };

export default function Pulse() {
  const [data, setData] = useState<Board | null>(() => cachedOnSwitch<Board>("/api/board?"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const url = "/api/board?";
      const cached = readCache<Board>(url);
      if (cached) setData(cached);
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      writeCache(url, json);
      warmOtherPages();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    // Refresh when the app comes back to the front on a phone.
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load]);

  return (
    <>
      <main className="kb-main kp-main">
        {!data && !error && <div className="kb-loading">Loading…</div>}
        {error && !data && <div className="kb-error">Couldn&apos;t load: {error}</div>}
        {data && <Content d={data} busy={busy} error={error} onRefresh={load} />}
      </main>
    </>
  );
}

function Content({ d, busy, error, onRefresh }: { d: Board; busy: boolean; error: string | null; onRefresh: () => void }) {
  const m = d.month;
  const day = Number(d.today.slice(8, 10));
  const left = m.daysInMonth - day;
  const rev = d.targets.find((t) => t.format === "gbp");
  const all = [
    ...d.people.rows.filter((p) => p.status !== "pending").map((p) => p.status),
    ...d.targets.map((t) => t.status),
  ];
  const behind = all.filter((s) => s === "behind").length;
  const good = all.length - behind;
  const verdict =
    all.length === 0 ? "" : behind === 0 ? "Everything is on track." : behind === 1 ? "One target is behind." : `${behind} targets are behind.`;

  return (
    <div className={`kp kb-fade${busy ? " busy" : ""}`}>
      <div className="kp-top">
        <div>
          <div className="kb-date">
            {new Date(d.today + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
          </div>
          <h1 className="kb-hello">How we&apos;re <em>doing.</em></h1>
        </div>
        <button className="kp-refresh" onClick={onRefresh} aria-label="Refresh" disabled={busy}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
        </button>
      </div>
      <div className="kp-meta">
        {d.demo && <span className="kb-demo">DEMO DATA</span>}
        <span>{error ? "Refresh failed · " : ""}Updated {d.generatedAt.slice(11, 16)}</span>
      </div>

      {verdict && (
        <div className={`kp-verdict ${behind ? "bad" : "ok"}`}>
          <b>{verdict}</b>
          <span>{good} of {all.length} on track or ahead · day {day} of {m.daysInMonth}</span>
        </div>
      )}

      <div className="kp-row">
      {rev && (
        <a className="kp-hero" href="/finance">
          <span className="kp-label">Revenue booked in {m.label.split(" ")[0]}</span>
          <span className="kp-big">{short(rev.actual)}</span>
          <span className="kp-sub">
            of {short(rev.target)} · <span className={`kp-st ${rev.status}`}>{STATUS[rev.status]}</span>
          </span>
          <Bar actual={rev.actual} target={rev.target} pace={rev.pace} status={rev.status} />
          <span className="kp-sub">
            {rev.actual >= rev.target
              ? "Target hit."
              : left > 0
                ? `${gbp(rev.target - rev.actual)} to go · ${gbp(Math.ceil((rev.target - rev.actual) / left))} a day`
                : `${gbp(rev.target - rev.actual)} short`}
          </span>
        </a>
      )}

      <div className="kp-tiles">
        <a className="kp-tile" href="/">
          <span className="kp-label">Occupancy tonight</span>
          <span className="kp-num">{d.tonight.occupancyPct}%</span>
          <span className="kp-sub">
            <span className={d.tonight.vsLastWeekPts >= 0 ? "kb-up" : "kb-down"}>
              {d.tonight.vsLastWeekPts >= 0 ? "▲" : "▼"} {Math.abs(d.tonight.vsLastWeekPts)} pts
            </span>{" "}
            vs last {d.tonight.lastWeekDay}
          </span>
        </a>
        <a className="kp-tile" href="/finance?basis=booking">
          <span className="kp-label">Booked today</span>
          <span className="kp-num">{short(d.today_.revenue)}</span>
          <span className="kp-sub">{d.today_.bookings} bookings · 24h {short(d.today_.last24hRevenue)}</span>
        </a>
        <a className="kp-tile" href="/inbox?view=reply">
          <span className="kp-label">Waiting on a reply</span>
          <span className={`kp-num${d.inbox.unanswered > 0 ? " kb-down" : ""}`}>{d.inbox.unanswered}</span>
          <span className="kp-sub">{d.inbox.problems.filter((p) => p.severity === 3).length} urgent</span>
        </a>
        <a className="kp-tile" href="/">
          <span className="kp-label">Today</span>
          <span className="kp-num">{d.tonight.arriving}<small> in</small> · {d.tonight.leaving}<small> out</small></span>
          <span className="kp-sub">Arrivals · check-outs</span>
        </a>
        <a className="kp-tile" href="/finance">
          <span className="kp-label">Year so far</span>
          <span className="kp-num">{short(m.runningTotal)}</span>
          <span className="kp-sub">Revenue booked in {d.today.slice(0, 4)}</span>
        </a>
        <a className="kp-tile" href="/growth">
          <span className="kp-label">Properties</span>
          <span className="kp-num">{d.portfolio.units}</span>
          <span className="kp-sub">
            <span className={d.portfolio.onboardedThisMonth ? "kb-up" : ""}>+{d.portfolio.onboardedThisMonth}</span> /{" "}
            <span className={d.portfolio.lostThisMonth ? "kb-down" : ""}>−{d.portfolio.lostThisMonth}</span> this month
          </span>
        </a>
      </div>

      </div>

      <div className="kp-row kp-row-2">
      <section className="kp-card">
        <div className="kp-card-h">
          <h3>People</h3>
          <a href="/targets">All targets →</a>
        </div>
        {d.people.rows.map((p) => (
          <Line key={p.person} label={p.person} actual={p.actual} target={p.target} format={p.format} pace={p.pace} status={p.status} />
        ))}
        {d.people.source !== "sheet" && <p className="kp-note">Actuals appear once the Google Sheet is connected.</p>}
      </section>

      <section className="kp-card">
        <div className="kp-card-h">
          <h3>Company</h3>
          <a href="/targets">Details →</a>
        </div>
        {d.targets.filter((t) => t !== rev).map((t) => (
          <Line key={t.label} label={t.label} actual={t.actual} target={t.target} format={t.format} pace={t.pace} status={t.status} lower={t.lowerIsBetter} />
        ))}
      </section>
      </div>
    </div>
  );
}

function Bar({ actual, target, pace, status }: { actual: number | null; target: number; pace: number | null; status: string }) {
  const fill = actual === null ? 0 : Math.min(100, (actual / Math.max(1, target)) * 100);
  return (
    <div className="kb-bar kp-bar">
      <i className={status} style={{ width: `${fill}%` }} />
      {pace !== null && <u style={{ left: `${Math.min(100, (pace / Math.max(1, target)) * 100)}%` }} />}
    </div>
  );
}

function Line({ label, actual, target, format, pace, status, lower }: {
  label: string; actual: number | null; target: number; format: TargetProgress["format"]; pace: number | null; status: string; lower?: boolean;
}) {
  return (
    <div className="kp-line">
      <div className="kp-line-t">
        <span>{label}</span>
        <span>
          <b>{actual === null ? "—" : fmt(actual, format)}</b> {lower ? "max" : "/"} {fmt(target, format)}
          <span className={`kp-st ${status}`}>{STATUS[status]}</span>
        </span>
      </div>
      <Bar actual={actual} target={target} pace={pace} status={status} />
    </div>
  );
}
