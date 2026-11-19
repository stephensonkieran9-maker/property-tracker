import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "The portal isn't set up yet." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: "That email and password don't match. Check them and try again." }, { status: 401 });

  const access = await getAccess();
  if (access.kind === "not-configured") {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is missing in Vercel (property-tracker). Add it, then redeploy." }, { status: 503 });
  }
  if (access.kind === "error") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: access.message }, { status: 500 });
  }
  if (access.kind !== "ok") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Your account doesn't have access to the offers portal. Ask an admin to add you." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, home: access.me.role === "admin" ? "/admin" : "/portal" });
}
