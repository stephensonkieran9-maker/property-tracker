import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { OFFER_COLUMNS, toCsv } from "@/lib/portal/offers";
import { currentMonth, isMonth, monthBounds } from "@/lib/portal/period";
import { peopleNames, sumTotals, totalsByUser } from "@/lib/portal/stats";
import { EMPTY_TOTALS } from "@/lib/portal/types";

export const dynamic = "force-dynamic";

const PAGE = 100;
const UUID = /^[0-9a-f-]{36}$/i;

// All offers for a month, filterable by person / model / outcome. ?format=csv downloads them.
export async function GET(req: Request) {
  const auth = await requireMember("admin");
  if ("res" in auth) return auth.res;
  const q = new URL(req.url).searchParams;
  const month = isMonth(q.get("month")) ? q.get("month")! : currentMonth();
  const user = UUID.test(q.get("user") ?? "") ? q.get("user")! : null;
  const model = ["managed", "arbitraged"].includes(q.get("model") ?? "") ? q.get("model")! : null;
  const outcome = ["pending", "won", "lost"].includes(q.get("outcome") ?? "") ? q.get("outcome")! : null;
  const page = Math.max(0, Math.min(1000, Number(q.get("page")) || 0));
  const csv = q.get("format") === "csv";

  const db = createAdminClient();
  const b = monthBounds(month);
  const query = (from: number, to: number) => {
    let s = db.from("offers").select(OFFER_COLUMNS, { count: "exact" }).gte("sent_at", b.from).lt("sent_at", b.to);
    if (user) s = s.eq("user_id", user);
    if (model) s = s.eq("model", model);
    if (outcome) s = s.eq("outcome", outcome);
    return s.order("sent_at", { ascending: false }).range(from, to);
  };

  try {
    if (csv) {
      const rows: Array<Record<string, unknown>> = [];
      for (let from = 0; from < 50_000; from += 1000) {
        const { data, error } = await query(from, from + 999);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const names = await peopleNames(db, [...new Set(rows.map((r) => String(r.user_id)))]);
      const out = rows.map((r) => ({
        ...r,
        person: names.get(String(r.user_id))?.name ?? "",
        sent: new Date(String(r.sent_at)).toLocaleString("en-GB", { timeZone: "Europe/London" }),
      }));
      const body = toCsv(out, [
        ["sent", "Sent"], ["person", "Person"], ["property_name", "Property"], ["address", "Address"], ["apartment_type", "Apartment type"],
        ["location", "Requested location"], ["check_in", "Check in"], ["check_out", "Check out"], ["nights", "Nights"],
        ["adults", "Adults"], ["children", "Children"], ["nightly_rate", "Nightly rate (£)"], ["booking_value", "Booking value (£)"],
        ["commission_pct", "Commission %"], ["commission_value", "Commission (£)"], ["credit_terms_days", "Credit terms (days)"],
        ["company_contact", "Company contact"], ["model", "Model"], ["outcome", "Outcome"], ["notes", "Notes"],
      ]);
      return new NextResponse(body, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="keapr-offers-${month}.csv"` },
      });
    }

    const [list, totals] = await Promise.all([query(page * PAGE, page * PAGE + PAGE - 1), totalsByUser(db, month)]);
    if (list.error) throw new Error(list.error.message);
    const rows = list.data ?? [];
    const names = await peopleNames(db, [...totals.keys(), ...rows.map((r) => r.user_id)]);
    const people = [...names.entries()]
      .filter(([id, v]) => v.active || totals.has(id))
      .map(([id, v]) => ({ id, name: v.name }))
      .sort((a, b2) => a.name.localeCompare(b2.name));
    return NextResponse.json({
      month,
      offers: rows.map((r) => ({ ...r, person: names.get(r.user_id)?.name ?? "Unknown" })),
      total: list.count ?? rows.length,
      pageSize: PAGE,
      page,
      summary: user ? totals.get(user) ?? EMPTY_TOTALS : sumTotals(totals.values()),
      people,
    });
  } catch (e) {
    console.error("[admin/offers]", e);
    return NextResponse.json({ error: "Couldn't load offers. Has the database script been run?" }, { status: 500 });
  }
}
