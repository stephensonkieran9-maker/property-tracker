"use client";

import { useEffect, useState, useCallback } from "react";
import type { DashboardData } from "@/lib/types";
import LineChart from "./LineChart";
import MonthlyView from "./MonthlyView";

function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
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

  if (loading && !data) return <div className="loading">Loading property data…</div>;
  if (error && !data) return <div className="error">Couldn’t load data: {error}</div>;
  if (!data) return null;

  const { current, history, onboardings, stats } = data;
  const thisMonthLabel = stats.sinceFirst ? monthName(new Date().toISOString().slice(0, 7)) : "";

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="title">
            Property Tracker
            {data.demo && <span className="demo-badge">DEMO DATA</span>}
          </h1>
          <p className="subtitle">
            Live from Hostaway · portfolio size &amp; properties brought on over time
          </p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === "overview" ? "active" : ""}`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          className={`tab ${tab === "months" ? "active" : ""}`}
          onClick={() => setTab("months")}
        >
          By month
        </button>
      </div>

      {tab === "months" ? (
        <MonthlyView onboardings={onboardings} />
      ) : (
      <>
      <div className="grid">
        <div className="card">
          <p className="stat-label">Properties now</p>
          <div className="stat-value">{current.count}</div>
          <div className="stat-sub">live from Hostaway</div>
        </div>
        <div className="card">
          <p className="stat-label">Brought on this month</p>
          <div className="stat-value pos">+{stats.thisMonth}</div>
          <div className="stat-sub">{thisMonthLabel}</div>
        </div>
        <div className="card">
          <p className="stat-label">Last 30 days</p>
          <div className="stat-value small pos">+{stats.last30}</div>
          <div className="stat-sub">rolling</div>
        </div>
        <div className="card">
          <p className="stat-label">Previous month</p>
          <div className="stat-value small">+{stats.prevMonth}</div>
          <div className="stat-sub">for comparison</div>
        </div>
      </div>

      <div className="section">
        <h2>Portfolio growth</h2>
        <p className="hint">
          Total properties over time{stats.sinceFirst ? `, since ${prettyDate(stats.sinceFirst)}` : ""}.
        </p>
        <LineChart data={history} />
      </div>

      <div className="section">
        <h2>Properties brought on</h2>
        <p className="hint">Every property and the date it was onboarded in Hostaway, newest first.</p>
        <div className="feed">
          {onboardings.length === 0 && (
            <div className="empty">No onboarding dates found on your listings.</div>
          )}
          {onboardings.map((o) => (
            <div className="feed-row" key={o.id}>
              <span className="pill in">IN</span>
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
