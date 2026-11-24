"use client";

import { useCallback, useEffect, useState } from "react";

// Add, remove and set team targets right on the dashboard.
// People are either linked to the offers portal (actual = what they've won there) or manual.

type Unit = "gbp" | "int" | "pct";
type Source =
  | "manual" | "offers_value" | "offers_worth"
  | "unitsOnboarded" | "bookedRevenue" | "bookings" | "occupancy" | "unanswered" | "combinedRevenue";

interface Row {
  id: string;
  kind: "person" | "company";
  label: string;
  team: string | null;
  unit: Unit;
  source: Source;
  userId: string | null;
  target: number;
  actuals: Record<string, number>;
  lowerIsBetter: boolean;
}
interface Staff { id: string; name: string; monthlyTarget: number; worthTarget: number }

const PERSON_SOURCES: Array<[Source, string]> = [
  ["offers_value", "Offers page: booking value won"],
  ["offers_worth", "Offers page: worth to Keapr won"],
  ["manual", "Manual: type the actual in"],
];
const COMPANY_SOURCES: Array<[Source, string]> = [
  ["combinedRevenue", "Keapr Revenue Combined"],
  ["bookedRevenue", "Booked revenue (Hostaway)"],
  ["bookings", "Bookings made (Hostaway)"],
  ["unitsOnboarded", "New units onboarded (Hostaway)"],
  ["occupancy", "Month occupancy (Hostaway)"],
  ["unanswered", "Unanswered messages (Hostaway)"],
  ["manual", "Manual: type the actual in"],
];
/** Hostaway metrics fix their own unit. */
const FIXED_UNIT: Partial<Record<Source, Unit>> = {
  offers_value: "gbp", offers_worth: "gbp", combinedRevenue: "gbp", bookedRevenue: "gbp",
  bookings: "int", unitsOnboarded: "int", occupancy: "pct", unanswered: "int",
};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Something went wrong (${res.status}).`);
  return j as T;
}

export default function TargetsEditor({ month, monthLabel, onChanged, onClose }: {
  month: string; monthLabel: string; onChanged: () => void; onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState<"person" | "company" | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await call<{ targets: Row[]; staff: Staff[] }>("/api/targets");
      setRows(d.targets);
      setStaff(d.staff);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load targets.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const done = async (text: string) => {
    setMsg(text);
    setError(null);
    await load();
    onChanged();
  };
  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : "Couldn't save.");
    setMsg(null);
  };

  const save = async (id: string, body: Record<string, unknown>, label: string) => {
    try {
      await call(`/api/targets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await done(`Saved ${label}.`);
    } catch (e) {
      fail(e);
    }
  };
  const remove = async (r: Row) => {
    if (!confirm(`Remove the target for ${r.label}? Any actuals typed in for it go too.`)) return;
    try {
      await call(`/api/targets/${r.id}`, { method: "DELETE" });
      await done(`Removed ${r.label}.`);
    } catch (e) {
      fail(e);
    }
  };
  const add = async (body: Record<string, unknown>) => {
    try {
      await call("/api/targets", { method: "POST", body: JSON.stringify({ ...body, month }) });
      setAdding(null);
      await done(`Added ${body.label}.`);
    } catch (e) {
      fail(e);
    }
  };

  const people = rows?.filter((r) => r.kind === "person") ?? [];
  const company = rows?.filter((r) => r.kind === "company") ?? [];

  return (
    <div className="kt-edit">
      <div className="kt-edit-head">
        <b>Edit targets</b>
        <span>Monthly targets. Manual actuals are for {monthLabel}.</span>
        <button className="kb-link kt-edit-x" onClick={onClose}>Done</button>
      </div>
      {msg && <div className="kt-ok">{msg}</div>}
      {error && <div className="kt-err">{error}</div>}
      {!rows && !error && <div className="kb-empty">Loading…</div>}

      {rows && (
        <>
          <div className="kb-target-group">People</div>
          {people.map((r) => <EditRow key={r.id} r={r} staff={staff} month={month} onSave={save} onRemove={remove} />)}
          {adding === "person"
            ? <EditRow r={blank("person")} staff={staff} month={month} isNew onAdd={add} onCancel={() => setAdding(null)} />
            : <button className="kt-add" onClick={() => setAdding("person")}>+ Add person</button>}

          <div className="kb-target-group">Company</div>
          {company.map((r) => <EditRow key={r.id} r={r} staff={staff} month={month} onSave={save} onRemove={remove} />)}
          {adding === "company"
            ? <EditRow r={blank("company")} staff={staff} month={month} isNew onAdd={add} onCancel={() => setAdding(null)} />
            : <button className="kt-add" onClick={() => setAdding("company")}>+ Add company target</button>}
        </>
      )}
    </div>
  );
}

function blank(kind: "person" | "company"): Row {
  return {
    id: "", kind, label: "", team: null, unit: "gbp", source: kind === "person" ? "offers_value" : "combinedRevenue",
    userId: null, target: 0, actuals: {}, lowerIsBetter: false,
  };
}

function EditRow({ r, staff, month, isNew, onSave, onRemove, onAdd, onCancel }: {
  r: Row; staff: Staff[]; month: string; isNew?: boolean;
  onSave?: (id: string, body: Record<string, unknown>, label: string) => Promise<void>;
  onRemove?: (r: Row) => Promise<void>;
  onAdd?: (body: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState({
    label: r.label,
    team: r.team ?? "",
    source: r.source,
    userId: r.userId ?? "",
    unit: r.unit,
    target: r.target ? String(r.target) : "",
    actual: r.actuals[month] !== undefined ? String(r.actuals[month]) : "",
    lowerIsBetter: r.lowerIsBetter,
  });
  const [busy, setBusy] = useState(false);
  const sources = r.kind === "person" ? PERSON_SOURCES : COMPANY_SOURCES;
  const linked = v.source === "offers_value" || v.source === "offers_worth";
  const unit = FIXED_UNIT[v.source] ?? v.unit;

  const pickSource = (source: Source) => {
    const next = { ...v, source };
    if (source === "unanswered") next.lowerIsBetter = true;
    // Picking a Hostaway metric on a new company target fills the name in.
    if (isNew && r.kind === "company" && !v.label) next.label = COMPANY_SOURCES.find(([k]) => k === source)?.[1].replace(/ \(Hostaway\)$/, "") ?? "";
    setV(next);
  };
  const pickPerson = (userId: string) => {
    const s = staff.find((x) => x.id === userId);
    setV({
      ...v,
      userId,
      label: v.label || (s ? s.name.split(" ")[0] : ""),
      target: v.target || (s ? String(v.source === "offers_worth" ? s.worthTarget || "" : s.monthlyTarget || "") : ""),
    });
  };

  const body = () => ({
    kind: r.kind,
    label: v.label,
    team: v.team || null,
    source: v.source,
    userId: linked ? v.userId || null : null,
    unit,
    target: Number(v.target || 0),
    lowerIsBetter: v.lowerIsBetter,
    ...(v.source === "manual" ? { actual: v.actual === "" ? null : Number(v.actual), month } : {}),
  });

  const submit = async () => {
    setBusy(true);
    try {
      if (isNew) await onAdd?.(body());
      else await onSave?.(r.id, body(), v.label || r.label);
    } finally {
      setBusy(false);
    }
  };

  const unitLabel = unit === "gbp" ? "£" : unit === "pct" ? "%" : "";
  return (
    <div className={`kt-erow${isNew ? " new" : ""}`}>
      <div className="kt-efields">
        <label className="kt-f grow">
          <span>Name</span>
          <input value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder={r.kind === "person" ? "e.g. Gelo" : "e.g. Booked revenue"} />
        </label>
        <label className="kt-f">
          <span>Team</span>
          <input value={v.team} onChange={(e) => setV({ ...v, team: e.target.value })} placeholder="optional" />
        </label>
        <label className="kt-f grow">
          <span>Actual comes from</span>
          <select value={v.source} onChange={(e) => pickSource(e.target.value as Source)}>
            {sources.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {linked && (
          <label className="kt-f grow">
            <span>Offers team member</span>
            <select value={v.userId} onChange={(e) => pickPerson(e.target.value)}>
              <option value="">Choose…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        {!FIXED_UNIT[v.source] && (
          <label className="kt-f">
            <span>Unit</span>
            <select value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value as Unit })}>
              <option value="gbp">£</option>
              <option value="int">Number</option>
              <option value="pct">%</option>
            </select>
          </label>
        )}
        <label className="kt-f">
          <span>Monthly target {unitLabel}</span>
          <input type="number" min={0} inputMode="decimal" value={v.target} onChange={(e) => setV({ ...v, target: e.target.value })} />
        </label>
        {v.source === "manual" && (
          <label className="kt-f">
            <span>Actual this month {unitLabel}</span>
            <input type="number" min={0} inputMode="decimal" value={v.actual} onChange={(e) => setV({ ...v, actual: e.target.value })} placeholder="—" />
          </label>
        )}
        {r.kind === "company" && (
          <label className="kt-f kt-check">
            <input type="checkbox" checked={v.lowerIsBetter} onChange={(e) => setV({ ...v, lowerIsBetter: e.target.checked })} />
            <span>Lower is better (a maximum)</span>
          </label>
        )}
      </div>
      {linked && <p className="kt-ehint">Uses what they win on the offers page. Changing the target here also changes it on their portal.</p>}
      <div className="kt-ebtns">
        <button className="kt-btn" disabled={busy} onClick={submit}>{busy ? "Saving…" : isNew ? "Add" : "Save"}</button>
        {isNew
          ? <button className="kb-link" onClick={onCancel}>Cancel</button>
          : <button className="kb-link kt-danger" onClick={() => onRemove?.(r)}>Remove</button>}
      </div>
    </div>
  );
}
