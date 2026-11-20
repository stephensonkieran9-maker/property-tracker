import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { totalsByUser } from "@/lib/portal/stats";
import { currentMonth } from "@/lib/portal/period";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireMember("admin");
  if ("res" in auth) return auth.res;
  try {
    const db = createAdminClient();
    const [{ data, error }, totals] = await Promise.all([
      db.from("portal_members").select("user_id, role, monthly_target, worth_target, is_active, created_at, profiles!inner(full_name, email)"),
      totalsByUser(db, currentMonth()),
    ]);
    if (error) throw new Error(error.message);
    const staff = (data ?? []).map((m) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        id: m.user_id,
        name: p?.full_name ?? "",
        email: p?.email ?? "",
        role: m.role,
        monthlyTarget: Number(m.monthly_target) || 0,
        worthTarget: Number(m.worth_target) || 0,
        isActive: m.is_active,
        month: totals.get(m.user_id) ?? null,
      };
    });
    staff.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
    return NextResponse.json({ staff, me: auth.me.id });
  } catch (e) {
    console.error("[admin/staff]", e);
    return NextResponse.json({ error: "Couldn't load staff. Has the database script been run?" }, { status: 500 });
  }
}

// Add someone. New email → creates their login with the password given.
// Existing account (e.g. already on Training) → keeps their password unless a new one is given.
export async function POST(req: Request) {
  const auth = await requireMember("admin");
  if ("res" in auth) return auth.res;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(b.name ?? "").trim().slice(0, 120);
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const role = b.role === "admin" ? "admin" : "staff";
  const target = Number(b.monthlyTarget ?? 0);
  const worthTarget = Number(b.worthTarget ?? 0);
  if (!name) return NextResponse.json({ error: "Add their name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  if (password && password.length < 8) return NextResponse.json({ error: "Passwords need at least 8 characters." }, { status: 400 });
  if (!Number.isFinite(worthTarget) || worthTarget < 0) return NextResponse.json({ error: "Worth target must be a number." }, { status: 400 });
  if (!Number.isFinite(target) || target < 0) return NextResponse.json({ error: "Target must be a number." }, { status: 400 });

  const db = createAdminClient();
  const { data: existing } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
  let userId = existing?.id as string | undefined;
  let created = false;

  if (!userId) {
    if (!password) return NextResponse.json({ error: "They don't have an account yet, so set a password for them." }, { status: 400 });
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error || !data.user) {
      console.error("[staff] createUser", error);
      return NextResponse.json({ error: error?.message?.includes("already") ? "That email already has a login. Try again in a moment." : "Couldn't create the login." }, { status: 400 });
    }
    userId = data.user.id;
    created = true;
    // Training's trigger normally creates the profile; make sure it exists either way.
    await db.from("profiles").upsert({ id: userId, full_name: name, email }, { onConflict: "id", ignoreDuplicates: true });
  } else if (password) {
    const { error } = await db.auth.admin.updateUserById(userId, { password });
    if (error) return NextResponse.json({ error: "Couldn't set their password." }, { status: 400 });
  }

  const { error } = await db
    .from("portal_members")
    .upsert({ user_id: userId, role, monthly_target: target, worth_target: worthTarget, is_active: true, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    console.error("[staff] member", error);
    return NextResponse.json({ error: "Couldn't give them portal access." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, created });
}
