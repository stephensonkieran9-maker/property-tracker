import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOffers, type TargetSource } from "@/lib/boardTargets";
import { parseTarget } from "@/lib/boardTargetsInput";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f-]{36}$/i;

// Change a target (name, team, number, source, linked person) or a month's manual actual.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireMember("admin");
  if ("res" in auth) return auth.res;
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseTarget(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { row, actual } = parsed;

  const db = createAdminClient();
  const { data: cur, error: e1 } = await db.from("board_targets").select("kind, source, user_id, target, actuals").eq("id", params.id).maybeSingle();
  if (e1) return NextResponse.json({ error: "Couldn't load that target." }, { status: 500 });
  if (!cur) return NextResponse.json({ error: "That target has been removed." }, { status: 404 });

  const source = (row.source ?? cur.source) as TargetSource;
  const userId = "user_id" in row ? row.user_id : cur.user_id;
  if (cur.kind === "person" && !["manual", "offers_value", "offers_worth"].includes(source)) {
    return NextResponse.json({ error: "A person's target is either manual or linked to their offers." }, { status: 400 });
  }
  if (isOffers(source) && !userId) return NextResponse.json({ error: "Pick who on the offers team this is linked to." }, { status: 400 });

  const patch: Record<string, unknown> = { ...row, updated_at: new Date().toISOString() };
  if (source === "manual") patch.user_id = null;
  if (actual) {
    const a = { ...((cur.actuals as Record<string, number>) ?? {}) };
    if (actual.value === null) delete a[actual.month];
    else a[actual.month] = actual.value;
    patch.actuals = a;
  }
  const { error } = await db.from("board_targets").update(patch).eq("id", params.id);
  if (error) {
    console.error("[targets] update", error);
    return NextResponse.json({ error: "Couldn't save the change." }, { status: 500 });
  }

  // Keep the offers portal's target in step for linked people.
  if (isOffers(source) && userId && (row.target !== undefined || row.source !== undefined || "user_id" in row)) {
    const target = row.target ?? Number(cur.target);
    await db.from("portal_members")
      .update({ [source === "offers_worth" ? "worth_target" : "monthly_target"]: target, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireMember("admin");
  if ("res" in auth) return auth.res;
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const db = createAdminClient();
  const { error } = await db.from("board_targets").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Couldn't remove the target." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
