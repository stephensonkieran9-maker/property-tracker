import "server-only";
import type { Model, Outcome } from "./types";

// Validates offer input from the portal before it touches the database.

export const OFFER_COLUMNS =
  "id, user_id, property_name, address, apartment_type, location, check_in, check_out, nights, adults, children, nightly_rate, commission_pct, credit_terms_days, company_contact, platform, hostaway_listing_id, booking_value, commission_value, model, outcome, outcome_at, notes, sent_at";

const MODELS: Model[] = ["managed", "arbitraged"];
const OUTCOMES: Outcome[] = ["pending", "won", "lost"];

type Patch = Record<string, string | number | null>;

const text = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown, max: number) => {
  if (v === null || v === undefined || v === "") return null;
  const x = typeof v === "number" ? v : Number(String(v).replace(/[£,%\s]/g, ""));
  return Number.isFinite(x) && x >= 0 && x <= max ? x : undefined; // undefined = invalid
};
const date = (v: unknown) => (v === null || v === undefined || v === "" ? null : typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/**
 * Turns request JSON into a database row. `partial` allows updating only some fields.
 * Returns an error message for the person if something's wrong.
 */
export function parseOffer(body: Record<string, unknown>, partial: boolean): { row: Patch } | { error: string } {
  const row: Patch = {};
  const has = (k: string) => k in body;

  if (!partial || has("property_name")) {
    const v = text(body.property_name);
    if (!v) return { error: "Add the property name." };
    row.property_name = v;
  }
  for (const k of ["address", "apartment_type", "location", "company_contact", "platform"]) if (!partial || has(k)) row[k] = text(body[k]);
  if (!partial || has("notes")) row.notes = text(body.notes, 1000);

  for (const k of ["check_in", "check_out"]) {
    if (!partial || has(k)) {
      const v = date(body[k]);
      if (v === undefined) return { error: "Dates need to be valid." };
      row[k] = v;
    }
  }
  if (row.check_in && row.check_out && String(row.check_out) <= String(row.check_in)) return { error: "Check-out must be after check-in." };

  const nums: Array<[string, number, string, boolean]> = [
    ["nights", 1000, "Nights", true],
    ["nightly_rate", 100000, "Nightly rate", true],
    ["commission_pct", 100, "Platform commission %", false],
    ["credit_terms_days", 365, "Credit terms", false],
    ["adults", 100, "Adults", false],
    ["children", 100, "Children", false],
  ];
  for (const [k, max, label, required] of nums) {
    if (partial && !has(k)) continue;
    const v = num(body[k], max);
    if (v === undefined) return { error: `${label} doesn't look right.` };
    if (required && (v === null || (k === "nights" && v < 1))) return { error: `Add the ${label.toLowerCase()}.` };
    row[k] = k === "nights" || k === "adults" || k === "children" || k === "credit_terms_days" ? (v === null ? null : Math.round(v)) : v;
  }

  if (!partial || has("hostaway_listing_id")) {
    const v = body.hostaway_listing_id;
    const id = v === null || v === undefined || v === "" ? null : Number(v);
    if (id !== null && (!Number.isInteger(id) || id <= 0)) return { error: "That property doesn't look right." };
    row.hostaway_listing_id = id;
  }

  if (!partial || has("model")) {
    if (!MODELS.includes(body.model as Model)) return { error: "Choose Managed or Arbitraged." };
    row.model = body.model as Model;
  }
  if (has("outcome")) {
    if (!OUTCOMES.includes(body.outcome as Outcome)) return { error: "Outcome must be pending, won or lost." };
    row.outcome = body.outcome as Outcome;
    row.outcome_at = body.outcome === "pending" ? null : new Date().toISOString();
  }
  return { row };
}

export function toCsv(rows: Array<Record<string, unknown>>, cols: Array<[string, string]>): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Stop spreadsheet formulas being injected through text fields.
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.map(([, h]) => h).join(","), ...rows.map((r) => cols.map(([k]) => esc(r[k])).join(","))].join("\n");
}
