"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, monthName, shiftMonth, shrinkImage, signOut } from "@/lib/portal/format";
import type { Countdown, LeaderRow, Me, Offer, OfferFields, Outcome } from "@/lib/portal/types";
import OfferForm, { toValues, type FormValues } from "./OfferForm";
import { Brand, CountdownCard, Leaderboard, OfferCard } from "./Shared";

interface MeData {
  me: Me;
  month: string;
  countdown: Countdown;
  offers: Offer[];
  leaderboard: LeaderRow[];
  lb: "month" | "last" | "all";
}

type Tab = "upload" | "offers" | "leaderboard";

export function toPayload(v: FormValues) {
  return {
    ...v,
    nights: v.nights === "" ? null : Number(v.nights),
    nightly_rate: v.nightly_rate === "" ? null : Number(v.nightly_rate),
    commission_pct: v.commission_pct === "" ? null : Number(v.commission_pct),
    credit_terms_days: v.credit_terms_days === "" ? null : Number(v.credit_terms_days),
    adults: v.adults === "" ? null : Number(v.adults),
    children: v.children === "" ? null : Number(v.children),
    hostaway_listing_id: v.model === "managed" && v.hostaway_listing_id ? Number(v.hostaway_listing_id) : null,
  };
}

export default function Portal({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>("upload");
  const [data, setData] = useState<MeData | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [lb, setLb] = useState<"month" | "last" | "all">("month");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ lb });
      if (month) q.set("month", month);
      setData(await api<MeData>(`/api/portal/me?${q}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load.");
    }
  }, [month, lb]);

  useEffect(() => {
    load();
  }, [load]);

  const current = data?.month && !month ? data.month : month;

  return (
    <div className="pt">
      <Brand right={<><span className="pt-who">{me.name}</span>{me.role === "admin" && <a className="pt-link" href="/admin">Admin</a>}<button className="pt-link" onClick={signOut}>Sign out</button></>} />
      <main className="pt-main">
        {error && <div className="pt-error">{error}</div>}
        {data ? <CountdownCard c={data.countdown} name={me.name} /> : !error && <div className="pt-loading">Loading…</div>}

        <nav className="pt-tabs">
          {([["upload", "Upload offer"], ["offers", "My offers"], ["leaderboard", "Leaderboard"]] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>

        {tab === "upload" && <Upload onSaved={() => { load(); setTab("offers"); }} />}

        {tab === "offers" && data && (
          <MyOffers
            data={data}
            month={current ?? data.month}
            onMonth={(m) => setMonth(m)}
            reload={load}
          />
        )}

        {tab === "leaderboard" && data && <Leaderboard rows={data.leaderboard} meId={me.id} period={lb} onPeriod={setLb} />}
      </main>
    </div>
  );
}

function Upload({ onSaved }: { onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues | null>(null);
  const [dupe, setDupe] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const read = useCallback(async (file: File) => {
    setSaved(false);
    setDupe(null);
    setReadError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setReading(true);
    setValues(null);
    try {
      const blob = await shrinkImage(file);
      const fd = new FormData();
      fd.append("image", blob, file.name || "screenshot");
      const { fields } = await api<{ fields: OfferFields }>("/api/portal/extract", { method: "POST", body: fd });
      setValues(toValues(fields));
    } catch (e) {
      setReadError(e instanceof Error ? e.message : "Couldn't read the screenshot.");
      setValues(toValues(null)); // let them type it in
    } finally {
      setReading(false);
    }
  }, [preview]);

  // Paste a screenshot straight in (Ctrl/Cmd+V) on desktop.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        read(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [read]);

  const save = async (v: FormValues, force = false) => {
    try {
      await api("/api/portal/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...toPayload(v), force }),
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 409) {
        setDupe(err.message);
        setValues(v);
        return;
      }
      throw e;
    }
    setValues(null);
    setDupe(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSaved(true);
    onSaved();
  };

  return (
    <section className="kb-card">
      <h3>Upload an offer</h3>
      <p className="kb-sub">Add a screenshot of the offer. The details are read for you to check, then saved. The image isn&apos;t kept.</p>

      {saved && <div className="pt-ok">Saved. Add the next one whenever you&apos;re ready.</div>}

      <div className="pt-drop" onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) read(f); }}>
        {preview ? <img src={preview} alt="Offer screenshot" /> : (
          <div>
            <b>Choose a screenshot</b>
            <span>or drop it here · paste with Ctrl/Cmd+V</span>
          </div>
        )}
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
      </div>

      {reading && <div className="pt-reading"><i /> Reading the screenshot…</div>}
      {readError && <div className="pt-error">{readError}</div>}
      {!values && !reading && !preview && (
        <button className="pt-link" onClick={() => setValues(toValues(null))}>Or type the details in</button>
      )}

      {values && !reading && (
        <OfferForm
          initial={values}
          submitLabel={dupe ? "Save anyway" : "Save offer"}
          note={dupe ? <div className="pt-warn">{dupe} Save anyway?</div> : !readError && preview ? <div className="pt-hint">Check these against the screenshot, then choose Managed or Arbitraged.</div> : undefined}
          onSubmit={(v) => save(v, Boolean(dupe))}
          onCancel={() => { setValues(null); setDupe(null); if (preview) URL.revokeObjectURL(preview); setPreview(null); }}
        />
      )}
    </section>
  );
}

function MyOffers({ data, month, onMonth, reload }: { data: MeData; month: string; onMonth: (m: string) => void; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Offer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Outcome | "all">("all");
  const [err, setErr] = useState<string | null>(null);
  const now = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }).slice(0, 7);

  const setOutcome = async (o: Offer, outcome: Outcome) => {
    setBusy(o.id);
    try {
      await api(`/api/portal/offers/${o.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ outcome }) });
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (o: Offer) => {
    if (!confirm(`Delete the offer for ${o.property_name}? This can't be undone.`)) return;
    setBusy(o.id);
    try {
      await api(`/api/portal/offers/${o.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't delete.");
    } finally {
      setBusy(null);
    }
  };

  const list = data.offers.filter((o) => filter === "all" || o.outcome === filter);
  const count = (k: Outcome) => data.offers.filter((o) => o.outcome === k).length;

  if (editing) {
    return (
      <section className="kb-card">
        <h3>Edit offer</h3>
        <p className="kb-sub">{editing.property_name}</p>
        <OfferForm
          initial={toValues(editing)}
          submitLabel="Save changes"
          onCancel={() => setEditing(null)}
          onSubmit={async (v) => {
            await api(`/api/portal/offers/${editing.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(toPayload(v)) });
            setEditing(null);
            await reload();
          }}
        />
      </section>
    );
  }

  return (
    <section className="kb-card">
      <div className="kb-cardhead">
        <div>
          <h3>My offers</h3>
          <p className="kb-sub">{monthName(month)} · {data.offers.length} sent</p>
        </div>
        <div className="pt-month">
          <button onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <button onClick={() => onMonth(shiftMonth(month, 1))} disabled={month >= now} aria-label="Next month">›</button>
        </div>
      </div>
      <div className="kb-pills pt-filter">
        {([["all", `All ${data.offers.length}`], ["pending", `Pending ${count("pending")}`], ["won", `Won ${count("won")}`], ["lost", `Lost ${count("lost")}`]] as const).map(([k, l]) => (
          <button key={k} className={`kb-pill${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {err && <div className="pt-error">{err}</div>}
      {list.length === 0 && <div className="kb-empty">No offers here yet.</div>}
      <div className="pt-offers">
        {list.map((o) => (
          <OfferCard key={o.id} o={o} busy={busy === o.id} onOutcome={(x) => setOutcome(o, x)} onEdit={() => setEditing(o)} onDelete={() => remove(o)} />
        ))}
      </div>
    </section>
  );
}
