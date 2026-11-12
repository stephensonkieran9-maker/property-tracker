// Per-person targets, pulled from a Google Sheet once a day.
//
// Point TARGETS_SHEET_CSV_URL at the sheet as CSV. Either:
//   • File → Share → Publish to web → choose the tab → CSV, copy the link, or
//   • for a sheet shared "anyone with the link can view":
//     https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=<TAB NAME>
//
// Expected columns (header row, any order, case-insensitive):
//   Person | Target | Actual | Month (optional, YYYY-MM) | Unit (optional: £, units, %) | Team (optional)
// Rows with a Month only apply to that month; rows without apply to every month.

export interface PersonTarget {
  person: string;
  team?: string;
  target: number;
  actual: number | null;
  unit: "gbp" | "int" | "pct";
}

// Used until the sheet is connected. Monthly targets.
const DEFAULTS: PersonTarget[] = [
  { person: "Gelo", target: 20000, actual: null, unit: "gbp" },
  { person: "Darwin", target: 5000, actual: null, unit: "gbp" },
  { person: "Christine", target: 10000, actual: null, unit: "gbp" },
];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const num = (s?: string): number | null => {
  if (s === undefined) return null;
  const clean = s.replace(/[£,%\s]/g, "");
  if (!clean) return null;
  const k = /k$/i.test(clean);
  const n = Number(k ? clean.slice(0, -1) : clean);
  return Number.isFinite(n) ? (k ? n * 1000 : n) : null;
};

function unitOf(s: string | undefined, rawTarget: string | undefined): PersonTarget["unit"] {
  const v = `${s ?? ""} ${rawTarget ?? ""}`.toLowerCase();
  if (v.includes("%") || v.includes("pct") || v.includes("percent")) return "pct";
  if (v.includes("£") || v.includes("gbp") || v.includes("revenue")) return "gbp";
  if (v.includes("unit") || v.includes("propert") || v.includes("count")) return "int";
  return "gbp";
}

let cache: { at: number; rows: string[][] } | null = null;
const DAY = 24 * 60 * 60 * 1000;

/** Fetch the sheet at most once a day (per server instance). */
async function loadSheet(): Promise<string[][] | null> {
  const url = process.env.TARGETS_SHEET_CSV_URL;
  if (!url) return null;
  if (cache && Date.now() - cache.at < DAY) return cache.rows;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`Targets sheet fetch failed (${res.status})`);
  const rows = parseCsv(await res.text());
  cache = { at: Date.now(), rows };
  return rows;
}

export async function getPersonTargets(month: string): Promise<{ people: PersonTarget[]; source: "sheet" | "default"; error?: string }> {
  try {
    const rows = await loadSheet();
    if (!rows || rows.length < 2) return { people: DEFAULTS, source: "default" };
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => head.findIndex((h) => h === name || h.startsWith(name));
    const iP = col("person") >= 0 ? col("person") : col("name");
    const iT = col("target");
    const iA = col("actual");
    const iM = col("month");
    const iU = col("unit");
    const iTeam = col("team");
    if (iP < 0 || iT < 0) return { people: DEFAULTS, source: "default", error: "Sheet needs Person and Target columns" };

    const byPerson = new Map<string, PersonTarget>();
    for (const r of rows.slice(1)) {
      const person = r[iP]?.trim();
      const target = num(r[iT]);
      if (!person || target === null) continue;
      const m = iM >= 0 ? r[iM]?.trim().slice(0, 7) : "";
      if (m && m !== month) continue;
      const entry: PersonTarget = {
        person,
        team: iTeam >= 0 ? r[iTeam]?.trim() || undefined : undefined,
        target,
        actual: iA >= 0 ? num(r[iA]) : null,
        unit: unitOf(iU >= 0 ? r[iU] : undefined, r[iT]),
      };
      // A month-specific row beats a general one.
      if (!byPerson.has(person) || m) byPerson.set(person, entry);
    }
    const people = Array.from(byPerson.values());
    return people.length ? { people, source: "sheet" } : { people: DEFAULTS, source: "default" };
  } catch (e) {
    return { people: DEFAULTS, source: "default", error: e instanceof Error ? e.message : "Sheet error" };
  }
}
