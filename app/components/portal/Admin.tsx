"use client";

import { useCallback, useEffect, useState } from "react";
import { api, gbp, monthName, pct, shiftMonth, signOut } from "@/lib/portal/format";
import type { LeaderRow, Me, Metric, Offer, Outcome, Totals } from "@/lib/portal/types";
import OfferForm, { toValues } from "./OfferForm";
import { toPayload } from "./Portal";
import { Leaderboard, OfferCard } from "./Shared";

type Tab = "offers" | "staff" | "leaderboard";

export default function Admin({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>("offers");
  return (
    <main className="kb-main pt-admin">
      <div className="kb-head">
        <div>
          <div className="kb-date">Bookings team</div>
          <h1 className="kb-hello">Offers <em>admin</em></h1>
        </div>
        <div className="kb-headr">
          <div className="kb-pills">
            {([["offers", "Offers"], ["staff", "Staff"], ["leaderboard", "Leaderboard"]] as const).map(([k, l]) => (
              <button key={k} className={`kb-pill${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <a className="pt-link" href="/portal">Staff view</a>
          <button className="pt-link" onClick={signOut}>Sign out</button>
        </div>
      </div>
      {tab === "offers" && <Offers />}
      {tab === "staff" && <Staff meId={me.id} />}
      {tab === "leaderboard" && <Board />}
    </main>
  );
}

interface OffersData {
  month: string;
  offers: Offer[];
  total: number;
  pageSize: number;
  page: number;
  summary: Totals;
  people: Array<{ id: string; name: string }>;
}

function Offers() {
  const now = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }).slice(0, 7);
  const [f, setF] = useState({ month: now, user: "", model: "", outcome: "" });
  const [data, setData] = useState<OffersData | null>(null);
  const [extra, setExtra] = useState<Offer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Offer | null>(null);

  const qs = useCallback((page = 0, csv = false) => {
    const q = new URLSearchParams({ month: f.month, page: String(page) });
    if (f.user) q.set("user", f.user);
    if (f.model) q.set("model", f.model);
    if (f.outcome) q.set("outcome", f.outcome);
    if (csv) q.set("format", "csv");
    return q.toString();
  }, [f]);

  const load = useCallback(async () => {
    try {
      setData(await api<OffersData>(`/api/portal/admin/offers?${qs()}`));
      setExtra([]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load.");
    }
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  const more = async () => {
    if (!data) return;
    const page = data.page + 1 + Math.floor(extra.length / data.pageSize);
    const next = await api<OffersData>(`/api/portal/admin/offers?${qs(page)}`);
    setExtra((x) => [...x, ...next.offers]);
  };

  const setOutcome = async (o: Offer, outcome: Outcome) => {
    setBusy(o.id);
    try {
      await api(`/api/portal/offers/${o.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ outcome }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (o: Offer) => {
    if (!confirm(`Delete ${o.person ?? "this"}'s offer for ${o.property_name}? This can't be undone.`)) return;
    setBusy(o.id);
    try {
      await api(`/api/portal/offers/${o.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete.");
    } finally {
      setBusy(null);
    }
  };

  if (editing) {
    return (
      <section className="kb-card pt-narrow">
        <h3>Edit {editing.person ? `${editing.person}'s` : ""} offer</h3>
        <p className="kb-sub">{editing.property_name}</p>
        <OfferForm
          initial={toValues(editing)}
          submitLabel="Save changes"
          onCancel={() => setEditing(null)}
          onSubmit={async (v) => {
            await api(`/api/portal/offers/${editing.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(toPayload(v)) });
            setEditing(null);
            await load();
          }}
        />
      </section>
    );
  }

  const s = data?.summary;
  const rows = [...(data?.offers ?? []), ...extra];
  const sel = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <div className="pt-filters">
        <div className="pt-month">
          <button onClick={() => setF({ ...f, month: shiftMonth(f.month, -1) })} aria-label="Previous month">‹</button>
          <b>{monthName(f.month)}</b>
          <button onClick={() => setF({ ...f, month: shiftMonth(f.month, 1) })} disabled={f.month >= now} aria-label="Next month">›</button>
        </div>
        <select value={f.user} onChange={sel("user")} aria-label="Person">
          <option value="">Everyone</option>
          {data?.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={f.model} onChange={sel("model")} aria-label="Model">
          <option value="">Managed + arbitraged</option>
          <option value="managed">Managed</option>
          <option value="arbitraged">Arbitraged</option>
        </select>
        <select value={f.outcome} onChange={sel("outcome")} aria-label="Outcome">
          <option value="">Any outcome</option>
          <option value="pending">Pending</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <a className="pt-btn ghost" href={`/api/portal/admin/offers?${qs(0, true)}`}>Download CSV</a>
      </div>

      {error && <div className="pt-error">{error}</div>}

      {s && (
        <div className="kb-kpis pt-kpis">
          <div className="kb-kpi"><span className="kb-kpi-l">Offers sent</span><span className="kb-kpi-v">{s.sent}</span><span className="kb-kpi-s">{s.pending} pending</span></div>
          <div className="kb-kpi"><span className="kb-kpi-l">Won</span><span className="kb-kpi-v">{s.won}</span><span className="kb-kpi-s">{s.lost} lost</span></div>
          <div className="kb-kpi"><span className="kb-kpi-l">Win rate</span><span className="kb-kpi-v">{pct(s.won + s.lost ? s.won / (s.won + s.lost) : null)}</span><span className="kb-kpi-s">{s.won ? `1 in ${Math.round((s.sent / s.won) * 10) / 10} accepted` : "won ÷ decided"}</span></div>
          <div className="kb-kpi"><span className="kb-kpi-l">Booking value won</span><span className="kb-kpi-v">{gbp(s.wonValue)}</span><span className="kb-kpi-s">of {gbp(s.sentValue)} offered</span></div>
          <div className="kb-kpi"><span className="kb-kpi-l">Worth to Keapr won</span><span className="kb-kpi-v">{gbp(s.wonWorth)}</span><span className="kb-kpi-s">from won offers only</span></div>
          <div className="kb-kpi"><span className="kb-kpi-l">Net won (after platform commission)</span><span className="kb-kpi-v">{gbp(s.wonValue - s.wonCommission)}</span><span className="kb-kpi-s">{f.user ? "this person" : "whole team"}, {monthName(f.month)}</span></div>
        </div>
      )}

      <section className="kb-card">
        <h3>Offers</h3>
        <p className="kb-sub">{data ? `${data.total} matching${f.model || f.outcome ? " (totals above ignore the model and outcome filters)" : ""}` : "Loading…"}</p>
        {data && rows.length === 0 && <div className="kb-empty">No offers match.</div>}
        <div className="pt-offers pt-grid">
          {rows.map((o) => (
            <OfferCard key={o.id} o={o} showPerson busy={busy === o.id} onOutcome={(x) => setOutcome(o, x)} onEdit={() => setEditing(o)} onDelete={() => remove(o)} />
          ))}
        </div>
        {data && rows.length < data.total && <button className="pt-btn ghost pt-more" onClick={more}>Show more</button>}
      </section>
    </>
  );
}

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: "staff" | "admin";
  monthlyTarget: number;
  worthTarget: number;
  isActive: boolean;
  month: Totals | null;
}

function Staff({ meId }: { meId: string }) {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff", monthlyTarget: "", worthTarget: "" });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ staff: StaffRow[] }>("/api/portal/admin/staff")).staff);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>, done?: string) => {
    try {
      await api(`/api/portal/admin/staff/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setMsg(done ?? "Saved.");
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setMsg(null);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const r = await api<{ created: boolean }>("/api/portal/admin/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, monthlyTarget: Number(form.monthlyTarget) || 0, worthTarget: Number(form.worthTarget) || 0 }),
      });
      setMsg(r.created
        ? `${form.name} added. Send them the login page and their password.`
        : `${form.name} added. They already had an account (e.g. Training), so they sign in with ${form.password ? "the new password you set" : "their existing password"}.`);
      setForm({ name: "", email: "", password: "", role: "staff", monthlyTarget: "", worthTarget: "" });
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add them.");
      setMsg(null);
    } finally {
      setAdding(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="kb-grid kb-two">
      <section className="kb-card">
        <h3>Staff</h3>
        <p className="kb-sub">Who can use the offers portal. Admins also see this area.</p>
        {msg && <div className="pt-ok">{msg}</div>}
        {error && <div className="pt-error">{error}</div>}
        {!rows && !error && <div className="kb-empty">Loading…</div>}
        <div className="pt-staff">
          {rows?.map((r) => (
            <div key={r.id} className={`pt-person${r.isActive ? "" : " off"}`}>
              <div className="pt-person-top">
                <div>
                  <b>{r.name}</b>
                  <span>{r.email}</span>
                </div>
                <div className="pt-role" role="radiogroup" aria-label="Role">
                  {(["staff", "admin"] as const).map((role) => (
                    <button key={role} className={r.role === role ? "on" : ""} disabled={r.id === meId}
                      onClick={() => r.role !== role && patch(r.id, { role }, `${r.name} is now ${role === "admin" ? "an admin" : "staff"}.`)}>
                      {role === "staff" ? "Staff" : "Admin"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-person-row">
                <label>
                  Booking value target £
                  <input type="number" min={0} inputMode="numeric" defaultValue={r.monthlyTarget || ""}
                    onBlur={(e) => Number(e.target.value || 0) !== r.monthlyTarget && patch(r.id, { monthlyTarget: Number(e.target.value || 0) }, `Target updated for ${r.name}.`)} />
                </label>
                <label>
                  Worth to Keapr target £
                  <input type="number" min={0} inputMode="numeric" defaultValue={r.worthTarget || ""}
                    onBlur={(e) => Number(e.target.value || 0) !== r.worthTarget && patch(r.id, { worthTarget: Number(e.target.value || 0) }, `Worth target updated for ${r.name}.`)} />
                </label>
                <span className="pt-person-stat">
                  This month: {r.month ? `${r.month.sent} sent · ${r.month.won} won · ${gbp(r.month.wonValue)} booking value · ${gbp(r.month.wonWorth)} to Keapr` : "nothing yet"}
                </span>
              </div>
              <div className="pt-person-btns">
                <button className="pt-link" onClick={() => {
                  const p = prompt(`New password for ${r.name} (at least 8 characters). This also changes their Training password.`);
                  if (p) patch(r.id, { password: p }, `Password changed for ${r.name}.`);
                }}>Set password</button>
                {r.id !== meId && (
                  <button className={`pt-link${r.isActive ? " danger" : ""}`} onClick={() => patch(r.id, { isActive: !r.isActive }, r.isActive ? `${r.name} can no longer use the portal.` : `${r.name}'s access is back on.`)}>
                    {r.isActive ? "Remove access" : "Give access back"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="kb-card">
        <h3>Add someone</h3>
        <p className="kb-sub">If they&apos;re already on Training, use the same email. Leave the password blank to keep their existing one.</p>
        <form className="pt-form" onSubmit={add}>
          <div className="pt-fields">
            <label className="pt-field wide"><span>Name</span><input value={form.name} onChange={set("name")} required /></label>
            <label className="pt-field wide"><span>Email</span><input type="email" value={form.email} onChange={set("email")} required autoComplete="off" /></label>
            <label className="pt-field wide"><span>Password</span><input type="text" value={form.password} onChange={set("password")} autoComplete="new-password" placeholder="At least 8 characters" /></label>
            <label className="pt-field"><span>Monthly target: booking value won (£)</span><input type="number" min={0} inputMode="numeric" value={form.monthlyTarget} onChange={set("monthlyTarget")} /></label>
            <label className="pt-field"><span>Monthly target: worth to Keapr won (£)</span><input type="number" min={0} inputMode="numeric" value={form.worthTarget} onChange={set("worthTarget")} /></label>
          </div>
          <div className="pt-model" role="radiogroup" aria-label="Role">
            {(["staff", "admin"] as const).map((role) => (
              <button key={role} type="button" role="radio" aria-checked={form.role === role} className={form.role === role ? "on" : ""} onClick={() => setForm({ ...form, role })}>
                {role === "staff" ? "Staff" : "Admin"}
              </button>
            ))}
          </div>
          <div className="pt-actions"><button className="pt-btn" disabled={adding}>{adding ? "Adding…" : "Add"}</button></div>
        </form>
      </section>
    </div>
  );
}

function Board() {
  const [period, setPeriod] = useState<"month" | "last" | "all">("month");
  const [metric, setMetric] = useState<Metric>("value");
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ leaderboard: LeaderRow[] }>(`/api/portal/me?lb=${period}`)
      .then((d) => { setRows(d.leaderboard); setError(null); })
      .catch((e) => setError(e.message));
  }, [period]);
  if (error) return <div className="pt-error">{error}</div>;
  if (!rows) return <div className="kb-empty">Loading…</div>;
  return <div className="pt-narrow"><Leaderboard rows={rows} period={period} onPeriod={setPeriod} metric={metric} onMetric={setMetric} /></div>;
}
