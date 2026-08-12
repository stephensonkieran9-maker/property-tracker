"use client";

import { useEffect, useState, useCallback } from "react";
import type { DashboardData } from "@/lib/types";
import LineChart from "./LineChart";

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading && !data) {
    return <div className="loading">Loading property data…</div>;
  }
  if (error && !data) {
    return <div className="error">Couldn’t load data: {error}</div>;
  }
  if (!data) return null;

  const { current, history, changes, net } = data;
  const netClass = net.net > 0 ? "pos" : net.net < 0 ? "neg" : "";
  const netSign = net.net > 0 ? "+" : "";

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="title">
            Property Tracker
            {data.demo && <span className="demo-badge">DEMO DATA</span>}
          </h1>
          <p className="subtitle">
            Live count from Hostaway · net growth &amp; in/out over time
          </p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      <div className="grid">
        <div className="card">
          <p className="stat-label">Properties now</p>
          <div className="stat-value">{current.count}</div>
          <div className="stat-sub">live from Hostaway</div>
        </div>
        <div className="card">
          <p className="stat-label">Net change</p>
          <div className={`stat-value ${netClass}`}>
            {netSign}
            {net.net}
          </div>
          <div className="stat-sub">
            {net.since ? `since ${net.since}` : "no history yet"}
          </div>
        </div>
        <div className="card">
          <p className="stat-label">Brought on</p>
          <div className="stat-value small pos">+{net.added}</div>
          <div className="stat-sub">properties added</div>
        </div>
        <div className="card">
          <p className="stat-label">Off-boarded</p>
          <div className="stat-value small neg">-{net.removed}</div>
          <div className="stat-sub">properties removed</div>
        </div>
      </div>

      <div className="section">
        <h2>Property count over time</h2>
        <p className="hint">One data point per day. Trending up is the goal.</p>
        <LineChart data={history} />
      </div>

      <div className="section">
        <h2>Properties in &amp; out</h2>
        <p className="hint">Every add and removal we&apos;ve detected, newest first.</p>
        <div className="feed">
          {changes.length === 0 && (
            <div className="empty">
              No changes recorded yet. Once the roster shifts, moves show up here.
            </div>
          )}
          {changes.map((c, i) => (
            <div className="feed-row" key={`${c.date}-${c.type}-${c.id}-${i}`}>
              <span className={`pill ${c.type === "added" ? "in" : "out"}`}>
                {c.type === "added" ? "IN" : "OUT"}
              </span>
              <span className="feed-name">{c.name}</span>
              <span className="feed-date">{c.date}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
