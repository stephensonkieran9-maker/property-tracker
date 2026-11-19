import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (isSupabaseConfigured()) await createClient().auth.signOut();
  return NextResponse.json({ ok: true });
}
