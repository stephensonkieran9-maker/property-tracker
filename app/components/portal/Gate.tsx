"use client";

import { signOut } from "@/lib/portal/format";
import type { Access } from "@/lib/portal/auth";
import { Brand } from "./Shared";

// Shown instead of the portal when it isn't set up or the account has no access.
export default function Gate({ access, adminOnly }: { access: Access; adminOnly?: boolean }) {
  return (
    <div className="pt">
      <Brand />
      <main className="pt-main">
        <section className="kb-card pt-gate">
          {access.kind === "not-configured" && (
            <>
              <h3>Not set up yet</h3>
              <p className="kb-sub">The offers portal needs the Supabase keys in Vercel (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).</p>
            </>
          )}
          {access.kind === "error" && (
            <>
              <h3>Something&apos;s not connected</h3>
              <p className="kb-sub">{access.message}</p>
            </>
          )}
          {access.kind === "no-access" && (
            <>
              <h3>No access</h3>
              <p className="kb-sub">{access.email} doesn&apos;t have access to the offers portal. Ask an admin to add you.</p>
              <button className="pt-btn ghost" onClick={signOut}>Sign out</button>
            </>
          )}
          {access.kind === "ok" && adminOnly && (
            <>
              <h3>Admins only</h3>
              <p className="kb-sub">This area is for admins.</p>
              <a className="pt-btn" href="/portal">Go to my offers</a>
            </>
          )}
          {access.kind === "signed-out" && (
            <>
              <h3>Signed out</h3>
              <a className="pt-btn" href="/login">Sign in</a>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
