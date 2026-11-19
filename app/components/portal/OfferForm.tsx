"use client";

import { useState } from "react";
import { gbp2 } from "@/lib/portal/format";
import type { Model, Offer, OfferFields } from "@/lib/portal/types";

export type FormValues = Record<keyof OfferFields | "model" | "notes", string>;

const KEYS: Array<keyof FormValues> = [
  "property_name", "address", "apartment_type", "location", "check_in", "check_out", "nights", "adults", "children",
  "nightly_rate", "commission_pct", "credit_terms_days", "company_contact", "model", "notes",
];

export function toValues(o: Partial<Offer> | Partial<OfferFields> | null): FormValues {
  const v = {} as FormValues;
  for (const k of KEYS) {
    const x = (o as Record<string, unknown> | null)?.[k];
    v[k] = x === null || x === undefined ? "" : String(x);
  }
  return v;
}

function nightsBetween(a: string, b: string): number | null {
  if (!a || !b) return null;
  const d = Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400_000);
  return d > 0 ? d : null;
}

export default function OfferForm({
  initial, submitLabel, onSubmit, onCancel, note,
}: {
  initial: FormValues;
  submitLabel: string;
  onSubmit: (v: FormValues) => Promise<void>;
  onCancel?: () => void;
  note?: React.ReactNode;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setV((prev) => {
      const next = { ...prev, [k]: val };
      // Dates change → nights follow, unless they've typed nights themselves to something else.
      if (k === "check_in" || k === "check_out") {
        const n = nightsBetween(next.check_in, next.check_out);
        const before = nightsBetween(prev.check_in, prev.check_out);
        if (n && (!prev.nights || Number(prev.nights) === before)) next.nights = String(n);
      }
      return next;
    });
  };

  const nights = Number(v.nights) || 0;
  const rate = Number(v.nightly_rate) || 0;
  const value = nights * rate;
  const commission = value * ((Number(v.commission_pct) || 0) / 100);
  const dateNights = nightsBetween(v.check_in, v.check_out);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.model) return setError("Choose Managed or Arbitraged.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit(v);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof FormValues, label: string, opts: { type?: string; wide?: boolean; inputMode?: "decimal" | "numeric"; placeholder?: string; required?: boolean } = {}) => (
    <label className={`pt-field${opts.wide ? " wide" : ""}`}>
      <span>{label}{opts.required && <b> *</b>}</span>
      <input
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        value={v[k]}
        onChange={set(k)}
        placeholder={opts.placeholder}
        required={opts.required}
        step={opts.inputMode === "decimal" ? "any" : undefined}
        min={opts.type === "number" ? 0 : undefined}
      />
    </label>
  );

  return (
    <form className="pt-form" onSubmit={submit}>
      {note}
      <div className="pt-model" role="radiogroup" aria-label="Managed or arbitraged">
        {(["managed", "arbitraged"] as Model[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={v.model === m} className={v.model === m ? "on" : ""} onClick={() => setV({ ...v, model: m })}>
            {m === "managed" ? "Managed" : "Arbitraged"}
          </button>
        ))}
      </div>

      <div className="pt-fields">
        {field("property_name", "Property", { wide: true, required: true })}
        {field("address", "Address", { wide: true })}
        {field("apartment_type", "Apartment type")}
        {field("location", "Requested location")}
        {field("check_in", "Check in", { type: "date" })}
        {field("check_out", "Check out", { type: "date" })}
        {field("nights", "Nights", { type: "number", inputMode: "numeric", required: true })}
        {field("nightly_rate", "Nightly rate (£)", { type: "number", inputMode: "decimal", required: true })}
        {field("commission_pct", "Commission %", { type: "number", inputMode: "decimal" })}
        {field("credit_terms_days", "Credit terms (days)", { type: "number", inputMode: "numeric" })}
        {field("adults", "Adults", { type: "number", inputMode: "numeric" })}
        {field("children", "Children", { type: "number", inputMode: "numeric" })}
        {field("company_contact", "Company contact", { wide: true })}
        <label className="pt-field wide">
          <span>Notes</span>
          <textarea rows={2} value={v.notes} onChange={set("notes")} />
        </label>
      </div>

      {dateNights !== null && nights > 0 && dateNights !== nights && (
        <div className="pt-hint">The dates give {dateNights} nights but {nights} is entered. Check which is right.</div>
      )}

      <div className="pt-totals">
        <div><span>Booking value</span><b>{gbp2(value)}</b><small>{nights || 0} nights × {gbp2(rate)}</small></div>
        <div><span>Commission</span><b>{gbp2(commission)}</b><small>{Number(v.commission_pct) || 0}% of booking value</small></div>
      </div>

      {error && <div className="pt-error" role="alert">{error}</div>}
      <div className="pt-actions">
        {onCancel && <button type="button" className="pt-btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="submit" className="pt-btn" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}
