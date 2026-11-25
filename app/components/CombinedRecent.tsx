import type { CombinedRecent as Recent } from "@/lib/combined";

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

function vs(now: number, before: number, label: string) {
  if (!before) return <span className="kb-kpi-s">{label}: {gbp(before)}</span>;
  const p = Math.round(((now - before) / Math.abs(before)) * 100);
  return (
    <span className="kb-kpi-s">
      <span className={p >= 0 ? "kb-up" : "kb-down"}>{p >= 0 ? "+" : ""}{p}%</span> vs {label} ({gbp(before)})
    </span>
  );
}

/** Keapr Revenue Combined today and this week. Always the current day/week, whatever period is picked. */
export default function CombinedRecent({ r, compact }: { r?: Recent; compact?: boolean }) {
  if (!r) return null;
  const mon = new Date(r.weekStart + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (compact) return <>Today {gbp(r.today)} · This week {gbp(r.week)}</>;
  return (
    <div className="kc-recent">
      <div className="kc-rec">
        <span className="kb-kpi-l">Today</span>
        <span className="kc-rv">{gbp(r.today)}</span>
        {vs(r.today, r.yesterday, "yesterday")}
      </div>
      <div className="kc-rec">
        <span className="kb-kpi-l">This week · from Mon {mon}</span>
        <span className="kc-rv">{gbp(r.week)}</span>
        {vs(r.week, r.lastWeekToDate, "last week so far")}
      </div>
    </div>
  );
}
