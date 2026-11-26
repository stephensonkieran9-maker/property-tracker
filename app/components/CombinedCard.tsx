"use client";

import { useEffect, useState } from "react";
import type { CombinedPart, CombinedRecent } from "@/lib/combined";

// Keapr Revenue Combined card, shared by the board and Finance.
// Day / Week / Month toggle switches the whole card: total, comparison and breakdown.

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
type Span = "day" | "week" | "month";

export interface CombinedCardProps {
  month: CombinedPart;
  /** e.g. "November 2026" or "2026" on Finance's year view. */
  monthLabel: string;
  /** Lines under the month total (YTD, comparison…). */
  monthSub: React.ReactNode;
  platformPct: number;
  offersAvailable: boolean;
  offersError?: string;
  recent?: CombinedRecent;
  /** Extra line under the total on every view (e.g. "whole portfolio"). */
  note?: React.ReactNode;
  monthToggleLabel?: string;
}

function change(now: number, before: number, label: string) {
  if (!before) return <span className="kb-kpi-s">{label}: {gbp(before)}</span>;
  const p = Math.round(((now - before) / Math.abs(before)) * 100);
  return (
    <span className="kb-kpi-s">
      <span className={p >= 0 ? "kb-up" : "kb-down"}>{p >= 0 ? "▲" : "▼"} {Math.abs(p)}%</span> vs {label} ({gbp(before)})
    </span>
  );
}

export default function CombinedCard(p: CombinedCardProps) {
  const [span, setSpanState] = useState<Span>("month");
  useEffect(() => {
    try {
      const s = localStorage.getItem("kb_combined_span");
      if (s === "day" || s === "week" || s === "month") setSpanState(s);
    } catch {}
  }, []);
  const setSpan = (s: Span) => {
    setSpanState(s);
    try {
      localStorage.setItem("kb_combined_span", s);
    } catch {}
  };

  const r = p.recent;
  const view = span === "day" && r ? "day" : span === "week" && r ? "week" : "month";
  const c = view === "day" ? r!.dayPart : view === "week" ? r!.weekPart : p.month;
  const mon = r ? new Date(r.weekStart + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "";
  const label = view === "day" ? "Today" : view === "week" ? `This week · from ${mon}` : p.monthLabel;

  return (
    <section className="kb-card kc-card" style={{ marginBottom: 14 }}>
      <div className="kc-main">
        <div className="kc-head">
          <span className="kb-kpi-l">Keapr Revenue Combined · {label}</span>
          {r && (
            <div className="kc-span" role="radiogroup" aria-label="Period">
              {([["day", "Day"], ["week", "Week"], ["month", p.monthToggleLabel ?? "Month"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={view === k} className={view === k ? "on" : ""} onClick={() => setSpan(k)}>{l}</button>
              ))}
            </div>
          )}
        </div>
        <span className="kc-total">{gbp(c.total)}</span>
        {view === "day" && change(r!.today, r!.yesterday, "yesterday")}
        {view === "week" && change(r!.week, r!.lastWeekToDate, "last week to the same day")}
        {view === "month" && p.monthSub}
        {p.note && <span className="kb-kpi-s">{p.note}</span>}
      </div>
      <div className="kc-parts">
        <div className="kc-part">
          <span className="kb-kpi-l">Hostaway bookings</span>
          <span className="kc-v">{gbp(c.hostawayNet)}</span>
          <span className="kb-kpi-s">{p.platformPct}% Keapr share of {gbp(c.hostawayGross)} booked{p.offersAvailable ? " · offer bookings counted on the right" : ""}</span>
        </div>
        <span className="kc-plus">+</span>
        <div className="kc-part">
          <span className="kb-kpi-l">Offers won</span>
          <span className="kc-v">{p.offersAvailable ? gbp(c.offersWon) : "—"}</span>
          <span className="kb-kpi-s">
            {p.offersAvailable
              ? `${gbp(c.managedOffers)} managed (${c.managedOffersCount}, no commission) + ${gbp(c.arbitraged)} arbitraged (${c.arbitragedCount})${c.estimated ? ` · ${c.estimated} arbitraged without worth to Keapr yet, estimated` : ""}`
              : `Not included: ${p.offersError ?? "offers not available"}`}
          </span>
        </div>
      </div>
    </section>
  );
}
