import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { OFFER_COLUMNS, parseOffer } from "@/lib/portal/offers";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// People can change their own offers; admins can change anyone's.
async function load(id: string) {
  const auth = await requireMember();
  if ("res" in auth) return auth;
  if (!UUID.test(id)) return { res: NextResponse.json({ error: "Offer not found." }, { status: 404 }) };
  const db = createAdminClient();
  const { data } = await db.from("offers").select("id, user_id").eq("id", id).maybeSingle();
  if (!data || (data.user_id !== auth.me.id && auth.me.role !== "admin")) {
    return { res: NextResponse.json({ error: "Offer not found." }, { status: 404 }) };
  }
  return { db };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const r = await load(params.id);
  if ("res" in r) return r.res;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseOffer(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await r.db
    .from("offers")
    .update({ ...parsed.row, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select(OFFER_COLUMNS)
    .single();
  if (error) {
    console.error("[offers] update", error);
    return NextResponse.json({ error: "Couldn't save the change." }, { status: 500 });
  }
  return NextResponse.json({ offer: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const r = await load(params.id);
  if ("res" in r) return r.res;
  const { error } = await r.db.from("offers").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Couldn't delete the offer." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
