import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

// Service-role client: bypasses row-level security. Only used after the
// signed-in user's portal access has been checked in code (lib/portal/auth.ts).
export function createAdminClient() {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set in Vercel.");
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never let Next.js keep a copy of database reads (its fetch cache outlives deploys),
    // otherwise the board can show old targets and offer totals.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
