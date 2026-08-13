"use client";

import { useMemo, useState } from "react";
import type { OnboardEvent } from "@/lib/types";

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

interface Month {
  key: string;
  count: number;
  cumulative: number;
  items: OnboardEvent[];
}

export default function MonthlyView({ onboardings }: { onboardings: OnboardEvent[] }) {
  const [open, setOpen] = useState<string | null>(null);

  const months = useMemo<Month[]>(() => {
    const map = new Map<string, OnboardEvent[]>();
    for (const o of onboardings) {
      const key = o.date.slice(0, 7);
      const arr = map.get(key) ?? [];
      arr.push(o);
      map.set(key, arr);
    }
    // Ascending first, to build a running cumulative total...
    const asc = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let running = 0;
    const built = asc.map(([key, items]) => {
      running += items.length;
      return {
        key,
        count: items.length,
        cumulative: running,
        items: [...items].sort((a, b) => b.date.localeCompare(a.date)),
      };
    });
    // ...then show newest first.
    return built.reverse();
  }, [onboardings]);

  const max = Math.max(1, ...months.map((m) => m.count));
  const best = months.reduce((a, b) => (b.count > a.count ? b : a), months[0]);

  if (months.length === 0) {
    return <div className="empty">No onboarding dates found on your listings.</div>;
  }

  return (
    <div className="section">
      <h2>Brought on by month</h2>
      <p className="hint">
        {months.length} months tracked · best month was {monthLabel(best.key)} with +{best.count}.
        Click a month to see which properties.
      </p>

      <div className="months">
        {months.map((m) => {
          const isOpen = open === m.key;
          return (
            <div className={`month ${isOpen ? "open" : ""}`} key={m.key}>
              <button
                className="month-row"
                onClick={() => setOpen(isOpen ? null : m.key)}
                aria-expanded={isOpen}
              >
                <span className="month-caret" aria-hidden>
                  {isOpen ? "▾" : "▸"}
                </span>
                <span className="month-name">{monthLabel(m.key)}</span>
                <span className="month-bar-wrap">
                  <span
                    className="month-bar"
                    style={{ width: `${(m.count / max) * 100}%` }}
                  />
                </span>
                <span className="month-count">+{m.count}</span>
                <span className="month-total">{m.cumulative} total</span>
              </button>

              {isOpen && (
                <div className="month-items">
                  {m.items.map((o) => (
                    <div className="month-item" key={o.id}>
                      <span className="pill in">IN</span>
                      <span className="feed-name">
                        {o.name}
                        {o.city ? <span className="feed-city"> · {o.city}</span> : null}
                      </span>
                      <span className="feed-date">{dayLabel(o.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
