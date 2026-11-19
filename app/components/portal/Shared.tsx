"use client";

import { gbp, pct, short, ukDate, ukDay } from "@/lib/portal/format";
import type { Countdown, LeaderRow, Offer, Outcome } from "@/lib/portal/types";

export function Leaderboard({ rows, meId, period, onPeriod }: {
  rows: LeaderRow[];
  meId?: string;
  period: string;
  onPeriod: (p: "month" | "last" | "all") => void;
}) {
  const top = Math.max(1, ...rows.map((r) => r.wonValue));
  return (
    <section className="kb-card">
      <div className="kb-cardhead">
        <div>
          <h3>Leaderboard</h3>
          <p className="kb-sub">Ranked by booking value won</p>
        </div>
        <div className="kb-pills">
          {([["month", "This month"], ["last", "Last month"], ["all", "All time"]] as const).map(([k, l]) => (
            <button key={k} className={`kb-pill${period === k ? " on" : ""}`} onClick={() => onPeriod(k)}>{l}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 && <div className="kb-empty">No offers yet.</div>}
      <ol className="pt-lb">
        {rows.map((r, i) => (
          <li key={r.userId} className={r.userId === meId ? "me" : ""}>
            <span className={`pt-rank r${i + 1}`}>{i + 1}</span>
            <div className="pt-lb-main">
              <div className="pt-lb-top">
                <b>{r.name}{r.userId === meId && <em> (you)</em>}</b>
                <span className="pt-lb-val">{short(r.wonValue)}</span>
              </div>
              <div className="kb-bar"><i style={{ width: `${(r.wonValue / top) * 100}%` }} /></div>
              <div className="pt-lb-sub">
                {r.won} won of {r.sent} sent · win rate {pct(r.winRate)} · {gbp(r.wonValue - r.wonCommission)} net
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CountdownCard({ c, name }: { c: Countdown; name: string }) {
  const progress = c.target > 0 ? Math.min(100, (c.wonValue / c.target) * 100) : 0;
  const hit = c.target > 0 && c.remaining <= 0;
  return (
    <section className="pt-hero">
      <div className="pt-hero-tag">This month · {name.split(" ")[0]}</div>
      {c.target <= 0 ? (
        <p className="pt-big">No monthly target set yet.<small>Ask an admin to add one. Your offers still count on the leaderboard.</small></p>
      ) : hit ? (
        <p className="pt-big">Target hit. <em>Everything from here is extra.</em><small>{gbp(c.wonValue)} won against {gbp(c.target)}</small></p>
      ) : c.offersNeeded !== null ? (
        <p className="pt-big">
          <span className="pt-count">{c.offersNeeded.toLocaleString("en-GB")}</span> more offers to hit your target
          <small>
            {gbp(c.remaining)} to go · about {c.perDay} a day over {c.workdaysLeft} working day{c.workdaysLeft === 1 ? "" : "s"} left
            {c.valuePerOffer ? ` · each offer is worth about ${gbp(c.valuePerOffer)} at ${c.basis === "month" ? "your win rate this month" : c.basis === "all-time" ? "your usual win rate" : "the team's win rate"}` : ""}
          </small>
        </p>
      ) : (
        <p className="pt-big">{gbp(c.remaining)} to go<small>Mark a few offers as won or lost and the countdown starts.</small></p>
      )}
      {c.target > 0 && (
        <div className="pt-progress">
          <div className="kb-bar"><i className={hit ? "ahead" : ""} style={{ width: `${progress}%` }} /></div>
          <span>{gbp(c.wonValue)} of {gbp(c.target)}</span>
        </div>
      )}
      <div className="pt-ratio">
        <div><b>{c.sent}</b><span>sent</span></div>
        <div><b>{c.won}</b><span>accepted</span></div>
        <div><b>{c.oneIn !== null ? `1 in ${c.oneIn}` : "—"}</b><span>ratio</span></div>
        <div><b>{pct(c.winRate)}</b><span>win rate</span></div>
      </div>
    </section>
  );
}

export function OutcomeToggle({ value, onChange, disabled }: { value: Outcome; onChange: (o: Outcome) => void; disabled?: boolean }) {
  return (
    <div className="pt-outcome" role="radiogroup" aria-label="Outcome">
      {(["pending", "won", "lost"] as Outcome[]).map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled}
          className={`${o}${value === o ? " on" : ""}`} onClick={() => value !== o && onChange(o)}>
          {o === "pending" ? "Pending" : o === "won" ? "Won" : "Lost"}
        </button>
      ))}
    </div>
  );
}

export function OfferCard({ o, showPerson, busy, onOutcome, onEdit, onDelete }: {
  o: Offer;
  showPerson?: boolean;
  busy?: boolean;
  onOutcome: (o: Outcome) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className={`pt-offer ${o.outcome}`}>
      <div className="pt-offer-top">
        <div className="pt-offer-name">
          <b>{o.property_name}</b>
          <span>
            {showPerson && o.person ? `${o.person} · ` : ""}sent {ukDay(o.sent_at)} · {o.model === "managed" ? "Managed" : "Arbitraged"}
          </span>
        </div>
        <div className="pt-offer-val">
          <b>{gbp(o.booking_value)}</b>
          <span>{gbp(o.booking_value - o.commission_value)} net</span>
        </div>
      </div>
      <div className="pt-offer-meta">
        {o.check_in ? `${ukDate(o.check_in)} → ${ukDate(o.check_out)} · ` : ""}{o.nights} nights × {gbp(o.nightly_rate)}
        {o.commission_pct !== null ? ` · ${o.commission_pct}% platform` : ""}
        {o.location ? ` · for ${o.location}` : ""}
      </div>
      <div className="pt-offer-foot">
        <OutcomeToggle value={o.outcome} onChange={onOutcome} disabled={busy} />
        <div className="pt-offer-btns">
          {onEdit && <button className="pt-link" onClick={onEdit}>Edit</button>}
          {onDelete && <button className="pt-link danger" onClick={onDelete}>Delete</button>}
        </div>
      </div>
    </article>
  );
}

export function Brand({ right }: { right?: React.ReactNode }) {
  return (
    <header className="pt-top">
      <div className="pt-brand"><span>K</span> Keapr <em>offers</em></div>
      <div className="pt-top-r">{right}</div>
    </header>
  );
}
