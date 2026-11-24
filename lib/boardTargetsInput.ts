import "server-only";
import { ALL_SOURCES, isOffers, type TargetSource } from "./boardTargets";

// Validates target input from the dashboard before it touches the database.

export type TargetPatch = {
  kind?: "person" | "company";
  label?: string;
  team?: string | null;
  unit?: "gbp" | "int" | "pct";
  source?: TargetSource;
  user_id?: string | null;
  target?: number;
  lower_is_better?: boolean;
};

const UUID = /^[0-9a-f-]{36}$/i;

export function parseTarget(b: Record<string, unknown>, partial: boolean): { row: TargetPatch; actual?: { month: string; value: number | null } } | { error: string } {
  const row: TargetPatch = {};
  const has = (k: string) => k in b;

  if (!partial || has("kind")) {
    if (b.kind !== "person" && b.kind !== "company") return { error: "Choose person or company." };
    row.kind = b.kind;
  }
  if (!partial || has("label")) {
    const v = typeof b.label === "string" ? b.label.trim().slice(0, 120) : "";
    if (!v) return { error: "Add a name for the target." };
    row.label = v;
  }
  if (has("team")) row.team = typeof b.team === "string" && b.team.trim() ? b.team.trim().slice(0, 60) : null;
  if (!partial || has("unit")) {
    const u = b.unit ?? "gbp";
    if (u !== "gbp" && u !== "int" && u !== "pct") return { error: "Unit must be £, number or %." };
    row.unit = u;
  }
  if (!partial || has("source")) {
    const s = (b.source ?? "manual") as TargetSource;
    if (!ALL_SOURCES.includes(s)) return { error: "That isn't a source the board knows." };
    row.source = s;
  }
  if (has("userId")) {
    const u = b.userId;
    if (u !== null && u !== "" && (typeof u !== "string" || !UUID.test(u))) return { error: "Pick someone from the offers team." };
    row.user_id = u ? String(u) : null;
  }
  if (row.source && isOffers(row.source) && !partial && !row.user_id) return { error: "Pick who on the offers team this is linked to." };
  if (row.source === "manual") row.user_id = null;
  if (!partial || has("target")) {
    const t = Number(typeof b.target === "string" ? b.target.replace(/[£,%\s]/g, "") : b.target);
    if (!Number.isFinite(t) || t < 0 || t > 1e10) return { error: "Target must be a number." };
    row.target = t;
  }
  if (has("lowerIsBetter")) row.lower_is_better = Boolean(b.lowerIsBetter);

  let actual: { month: string; value: number | null } | undefined;
  if (has("actual")) {
    const month = String(b.month ?? "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "Which month is the actual for?" };
    const raw = b.actual;
    if (raw === null || raw === "") actual = { month, value: null };
    else {
      const v = Number(typeof raw === "string" ? raw.replace(/[£,%\s]/g, "") : raw);
      if (!Number.isFinite(v) || v < 0 || v > 1e10) return { error: "Actual must be a number." };
      actual = { month, value: v };
    }
  }
  return { row, actual };
}
