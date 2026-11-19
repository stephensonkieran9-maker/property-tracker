"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Brand } from "./Shared";

export default function Login() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't sign in.");
      const next = params.get("next") ?? "";
      // Only go back to pages on this site.
      location.href = next.startsWith("/") && !next.startsWith("//") && !(j.home === "/portal" && next.startsWith("/admin")) ? next : j.home;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
      setBusy(false);
    }
  };

  return (
    <div className="pt">
      <Brand />
      <main className="pt-main pt-login">
        <form className="kb-card pt-form" onSubmit={submit}>
          <h1 className="kb-hello">Sign <em>in</em></h1>
          <p className="kb-sub">Keapr team sign-in. Use the same email and password as Keapr Training.</p>
          <label className="pt-field wide"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="pt-field wide"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <div className="pt-error" role="alert">{error}</div>}
          <div className="pt-actions"><button className="pt-btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></div>
          <p className="pt-small">Forgotten your password? Ask an admin to set a new one.</p>
        </form>
      </main>
    </div>
  );
}
