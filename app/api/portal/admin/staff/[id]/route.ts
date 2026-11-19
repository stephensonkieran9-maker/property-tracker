import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Change someone's role, target, access, name or password.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireMember("admin");
  if ("res" in auth) return auth.res;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const self = params.id === auth.me.id;
  const db = createAdminClient();

  const patch: Record<string, unknown> = {};
  if ("role" in b) {
    if (b.role !== "staff" && b.role !== "admin") return NextResponse.json({ error: "Role must be staff or admin." }, { status: 400 });
    if (self && b.role !== "admin") return NextResponse.json({ error: "You can't remove your own admin access." }, { status: 400 });
    patch.role = b.role;
  }
  if ("monthlyTarget" in b) {
    const t = Number(b.monthlyTarget);
    if (!Number.isFinite(t) || t < 0) return NextResponse.json({ error: "Target must be a number." }, { status: 400 });
    patch.monthly_target = t;
  }
  if ("isActive" in b) {
    if (self && !b.isActive) return NextResponse.json({ error: "You can't remove your own access." }, { status: 400 });
    patch.is_active = Boolean(b.isActive);
  }
  if (Object.keys(patch).length) {
    const { error } = await db.from("portal_members").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", params.id);
    if (error) return NextResponse.json({ error: "Couldn't save the change." }, { status: 500 });
  }
  if (typeof b.name === "string" && b.name.trim()) {
    await db.from("profiles").update({ full_name: b.name.trim().slice(0, 120) }).eq("id", params.id);
  }
  if (typeof b.password === "string" && b.password) {
    if (b.password.length < 8) return NextResponse.json({ error: "Passwords need at least 8 characters." }, { status: 400 });
    const { error } = await db.auth.admin.updateUserById(params.id, { password: b.password });
    if (error) return NextResponse.json({ error: "Couldn't set the password." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
