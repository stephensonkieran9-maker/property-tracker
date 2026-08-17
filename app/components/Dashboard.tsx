"use client";

import { useEffect, useState, useCallback } from "react";
import type { DashboardData } from "@/lib/types";
import LineChart from "./LineChart";
import MonthlyView from "./MonthlyView";

/* ── Inline icons (no external deps) ───────────────────────── */
const IconGrid = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" />
  </svg>
);
const IconBuilding = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h6" />
  </svg>
);
const IconTrend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" />
  </svg>
);
const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);
const IconHistory = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" />
  </svg>
);
const IconRefresh = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
  </svg>
);

function currentMonthName(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "months">("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json as DashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <IconBuilding />
          </div>
          <div>
            <div className="brand-name">Property Tracker</div>
            <div className="brand-sub">Hostaway portfolio</div>
          </div>
        </div>

        <nav className="nav">
          <button
            className={`nav-item ${tab === "overview" ? "active" : ""}`}
            onClick={() => setTab("overview")}
          >
            <IconGrid /> Overview
          </button>
          <button
            className={`nav-item ${tab === "months" ? "active" : ""}`}
            onClick={() => setTab("months")}
          >
            <IconCalendar /> By month
          </button>
        </nav>

        <div className="sidebar-foot">
          <button className="btn-primary" onClick={load} disabled={loading}>
            <IconRefresh /> {loading ? "Refreshing…" : "Refresh"}
          </button>
          <div className="live">
            <span className="dot" /> Live from Hostaway
          </div>
        </div>
      </aside>

      <main className="main">
        {loading && !data ? (
          <div className="loading">Loading property data…</div>
        ) : error && !data ? (
          <div className="error">Couldn’t load data: {error}</div>
        ) : data ? (
          <Content data={data} tab={tab} />
        ) : null}
      </main>
    </div>
  );
}

function Content({ data, tab }: { data: DashboardData; tab: "overview" | "months" }) {
  const { current, history, onboardings, stats } = data;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>
            {tab === "overview" ? "Portfolio overview" : "Brought on by month"}
            {data.demo && <span className="demo-badge">DEMO DATA</span>}
          </h1>
          <p className="subtitle">
            {tab === "overview"
              ? "Track how many properties you've brought on over time."
              : "How many properties you onboarded each month."}
          </p>
        </div>
        <div className="updated">Updated {prettyDate(data.generatedAt.slice(0, 10))}</div>
      </header>

      {tab === "months" ? (
        <MonthlyView onboardings={onboardings} />
      ) : (
        <>
          <div className="grid">
            <div className="kpi">
              <div className="kpi-top">
                <span className="kpi-icon"><IconBuilding /></span>
                {stats.thisMonth > 0 && <span className="kpi-badge pos">+{stats.thisMonth} this month</span>}
              </div>
              <div className="kpi-label">Total properties</div>
              <div className="kpi-value">{current.count}</div>
            </div>

            <div className="kpi">
              <div className="kpi-top">
                <span className="kpi-icon"><IconTrend /></span>
                <span className="kpi-badge">{currentMonthName()}</span>
              </div>
              <div className="kpi-label">Brought on this month</div>
              <div className="kpi-value">+{stats.thisMonth}</div>
            </div>

            <div className="kpi">
              <div className="kpi-top">
                <span className="kpi-icon"><IconClock /></span>
                <span className="kpi-badge">rolling</span>
              </div>
              <div className="kpi-label">Last 30 days</div>
              <div className="kpi-value">+{stats.last30}</div>
            </div>

            <div className="kpi">
              <div className="kpi-top">
                <span className="kpi-icon"><IconHistory /></span>
                <span className="kpi-badge">previous</span>
              </div>
              <div className="kpi-label">Previous month</div>
              <div className="kpi-value">+{stats.prevMonth}</div>
            </div>
          </div>

          <div className="card">
            <h2>Portfolio growth</h2>
            <p className="hint">
              Total properties over time{stats.sinceFirst ? `, since ${prettyDate(stats.sinceFirst)}` : ""}.
            </p>
            <LineChart data={history} />
          </div>

          <div className="card">
            <h2>Properties brought on</h2>
            <p className="hint">Every property and the date it was onboarded in Hostaway, newest first.</p>
            <div className="feed">
              {onboardings.length === 0 && (
                <div className="empty">No onboarding dates found on your listings.</div>
              )}
              {onboardings.map((o) => (
                <div className="feed-row" key={o.id}>
                  <span className="pill">IN</span>
                  <span className="feed-name">
                    {o.name}
                    {o.city ? <span className="feed-city"> · {o.city}</span> : null}
                  </span>
                  <span className="feed-date">{prettyDate(o.date)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
