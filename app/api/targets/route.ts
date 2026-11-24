import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOffers, loadTargets, staffOptions } from "@/lib/boardTargets";
import { parseTarget } from "@/lib/boardTargetsInput";

export const dynamic = "force-dynamic";

// Dashboard targets: list (with the offers team, for linking people) and add.
export async function GET() {
  const auth = await requireMember("admin");
  if ("res" in auth) return auth.res;
  try {
    const db = createAdminClient();
    const [targets, staff] = await Promise.all([loadTargets(db), staffOptions(db)]);
    return NextResponse.json({ targets, staff });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load targets." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireMember("admin");
  if ("res" in auth) return auth.res;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseTarget(body, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { row, actual } = parsed;
  if (row.kind === "person" && row.source && !["manual", "offers_value", "offers_worth"].includes(row.source)) {
    return NextResponse.json({ error: "A person's target is either manual or linked to their offers." }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: last } = await db.from("board_targets").select("sort").eq("kind", row.kind!).order("sort", { ascending: false }).limit(1);
  const sort = (Number(last?.[0]?.sort) || 0) + 1;
  const actuals = actual && actual.value !== null ? { [actual.month]: actual.value } : {};

  const { data, error } = await db.from("board_targets").insert({ ...row, actuals, sort }).select("id").single();
  if (error) {
    console.error("[targets] insert", error);
    return NextResponse.json({ error: /does not exist|schema cache/i.test(error.message) ? "Run supabase/board_targets.sql in the Supabase SQL Editor first." : "Couldn't add the target." }, { status: 500 });
  }
  // Linked to the offers portal: their portal target is the same number.
  if (row.source && isOffers(row.source) && row.user_id) {
    await db.from("portal_members")
      .update({ [row.source === "offers_worth" ? "worth_target" : "monthly_target"]: row.target, updated_at: new Date().toISOString() })
      .eq("user_id", row.user_id);
  }
  return NextResponse.json({ ok: true, id: data.id });
}
