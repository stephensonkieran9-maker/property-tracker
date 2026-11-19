import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { OFFER_COLUMNS, parseOffer } from "@/lib/portal/offers";

export const dynamic = "force-dynamic";

// Save a new offer for the signed-in person.
export async function POST(req: Request) {
  const auth = await requireMember();
  if ("res" in auth) return auth.res;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseOffer(body, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const row = parsed.row;

  const db = createAdminClient();
  // Same property and dates already logged by anyone? Ask before saving a second copy.
  if (!body.force && row.check_in && row.check_out) {
    const { data: dupes } = await db
      .from("offers")
      .select("id, sent_at, profiles!inner(full_name)")
      .ilike("property_name", String(row.property_name).replace(/[%_\\]/g, "\\$&"))
      .eq("check_in", row.check_in)
      .eq("check_out", row.check_out)
      .limit(1);
    if (dupes && dupes.length) {
      const d = dupes[0] as unknown as { sent_at: string; profiles: { full_name: string } | Array<{ full_name: string }> };
      const who = Array.isArray(d.profiles) ? d.profiles[0]?.full_name : d.profiles?.full_name;
      const when = new Date(d.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
      return NextResponse.json({ duplicate: true, error: `${who ?? "Someone"} already logged this property for these dates on ${when}.` }, { status: 409 });
    }
  }

  const { data, error } = await db.from("offers").insert({ ...row, user_id: auth.me.id }).select(OFFER_COLUMNS).single();
  if (error) {
    console.error("[offers] insert", error);
    return NextResponse.json({ error: "Couldn't save the offer. Try again." }, { status: 500 });
  }
  return NextResponse.json({ offer: data });
}
