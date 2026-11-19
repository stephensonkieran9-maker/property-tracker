import "server-only";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Me, Role } from "./types";

export type Access =
  | { kind: "not-configured" }
  | { kind: "signed-out" }
  | { kind: "no-access"; email: string }
  | { kind: "ok"; me: Me };

/** Who is signed in, and whether they're an active portal member. */
export async function getAccess(): Promise<Access> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { kind: "not-configured" };
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return { kind: "signed-out" };

  const db = createAdminClient();
  const { data: row } = await db
    .from("portal_members")
    .select("role, monthly_target, is_active, profiles!inner(full_name, email, is_active)")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = row ? (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) : null;
  if (!row || !row.is_active || !profile || profile.is_active === false) {
    return { kind: "no-access", email: user.email ?? "" };
  }
  return {
    kind: "ok",
    me: {
      id: user.id,
      name: profile.full_name,
      email: profile.email,
      role: row.role as Role,
      monthlyTarget: Number(row.monthly_target) || 0,
    },
  };
}

/** For API routes: the member, or a ready-made error response. */
export async function requireMember(role?: Role): Promise<{ me: Me } | { res: NextResponse }> {
  const a = await getAccess();
  if (a.kind === "not-configured") return { res: NextResponse.json({ error: "The portal isn't set up yet." }, { status: 503 }) };
  if (a.kind === "signed-out") return { res: NextResponse.json({ error: "Please sign in again." }, { status: 401 }) };
  if (a.kind === "no-access") return { res: NextResponse.json({ error: "Your account doesn't have portal access." }, { status: 403 }) };
  if (role === "admin" && a.me.role !== "admin") return { res: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  return { me: a.me };
}
