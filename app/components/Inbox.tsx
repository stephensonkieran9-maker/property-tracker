"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "./Sidebar";
import { readCache, writeCache } from "@/lib/clientCache";
import AreaPicker from "./AreaPicker";
import type { Inbox as InboxData, InboxItem, ThreadMessage } from "@/lib/inbox";

type View = "reply" | "problems" | "all";
const VIEWS: Array<{ key: View; label: string }> = [
  { key: "reply", label: "Needs a reply" },
  { key: "problems", label: "Problems" },
  { key: "all", label: "All messages" },
];
const KINDS = ["Access", "Maintenance", "Refund", "Complaint", "Cancellation", "Noise", "WiFi"];

function waited(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
}

function when(stamp: string | undefined, today: string): string {
  if (!stamp) return "";
  const d = stamp.slice(0, 10);
  const t = stamp.slice(11, 16);
  if (d === today) return t;
  return `${new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} ${t}`;
}

export default function Inbox() {
  const router = useRouter();
  const params = useSearchParams();
  const view = (["reply", "problems", "all"].includes(params.get("view") ?? "") ? params.get("view") : "reply") as View;
  const selected = params.get("c") ? Number(params.get("c")) : null;

  const [data, setData] = useState<InboxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState("All");
  const [kind, setKind] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const p = new URLSearchParams(params.toString());
      if (value === null) p.delete(key);
      else p.set(key, value);
      router.replace(`/inbox?${p.toString()}`, { scroll: false });
    },
    [params, router]
  );

  const load = useCallback(async (g: string) => {
    setBusy(true);
    try {
      const url = `/api/inbox${g !== "All" ? `?group=${encodeURIComponent(g)}` : ""}`;
      const cached = readCache<InboxData>(url);
      if (cached) setData(cached);
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      writeCache(url, json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load(group);
    const t = setInterval(() => load(group), 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [load, group]);

  const items = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    return data.items.filter(
      (i) =>
        (view === "all" || (view === "reply" ? i.needsReply : !!i.kind)) &&
        (!kind || i.kind === kind) &&
        (!t || [i.guestName, i.listingName, i.group, i.lastMessage].some((v) => (v ?? "").toLowerCase().includes(t)))
    );
  }, [data, view, kind, q]);

  const current = data?.items.find((i) => i.id === selected) ?? null;

  return (
    <div className="kb">
      <Sidebar active="inbox" />
      <main className="kb-main">
        {!data && !error && <div className="kb-loading">Loading the inbox…</div>}
        {error && !data && <div className="kb-error">Couldn&apos;t load the inbox: {error}</div>}
        {data && (
          <div className={`kb-fade${busy ? " busy" : ""}`}>
            <div className="kb-head">
              <div>
                <div className="kb-date">Guest messages from the last 14 days</div>
                <h1 className="kb-hello">
                  Guest <em>inbox.</em>
                </h1>
              </div>
              <div className="kb-headr">
                {data.demo && <span className="kb-demo">DEMO DATA</span>}
                <span className="kb-updated">Updated {data.generatedAt.slice(11, 16)}</span>
                <AreaPicker data={data} group={group} setGroup={setGroup} />
              </div>
            </div>

            <div className="kb-kpis ki-kpis" style={{ marginBottom: 14 }}>
              <button className="kb-kpi kb-click" onClick={() => setParam("view", "reply")}>
                <span className="kb-kpi-l">Needs a reply</span>
                <span className="kb-kpi-v">{data.stats.needsReply}</span>
                <span className="kb-kpi-s">Guest spoke last</span>
              </button>
              <button className="kb-kpi kb-click" onClick={() => setParam("view", "problems")}>
                <span className="kb-kpi-l">Urgent</span>
                <span className={`kb-kpi-v${data.stats.urgent ? " kb-down" : ""}`}>{data.stats.urgent}</span>
                <span className="kb-kpi-s">Access or maintenance, waiting</span>
              </button>
              <button className="kb-kpi kb-click" onClick={() => setParam("view", "problems")}>
                <span className="kb-kpi-l">Problems flagged</span>
                <span className="kb-kpi-v">{data.stats.problems}</span>
                <span className="kb-kpi-s">From message wording</span>
              </button>
              <div className="kb-kpi">
                <span className="kb-kpi-l">Waiting over 1 hour</span>
                <span className={`kb-kpi-v${data.stats.overHour ? " kb-down" : ""}`}>{data.stats.overHour}</span>
                <span className="kb-kpi-s">Of those needing a reply</span>
              </div>
              <div className="kb-kpi">
                <span className="kb-kpi-l">Longest wait</span>
                <span className="kb-kpi-v">{data.stats.oldestWaitMins === null ? "—" : waited(data.stats.oldestWaitMins)}</span>
                <span className="kb-kpi-s">Oldest unanswered message</span>
              </div>
            </div>

            <div className="ki-toolbar">
              <div className="kb-pills">
                {VIEWS.map((v) => (
                  <button key={v.key} className={`kb-pill${view === v.key ? " on" : ""}`} onClick={() => setParam("view", v.key)}>
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="ki-kinds">
                {KINDS.filter((k) => data.stats.byKind[k]).map((k) => (
                  <button key={k} className={`ki-chip${kind === k ? " on" : ""}`} onClick={() => setKind(kind === k ? null : k)}>
                    {k} <span>{data.stats.byKind[k]}</span>
                  </button>
                ))}
              </div>
              <input className="kg-search" placeholder="Search guest, property or message…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <div className="ki-split">
              <section className="kb-card ki-list">
                {items.length === 0 && (
                  <div className="kb-empty">{view === "reply" ? "Nobody is waiting on a reply. Nice." : "No messages match."}</div>
                )}
                {items.map((i) => (
                  <Row key={i.id} item={i} today={data.today} on={i.id === selected} onClick={() => setParam("c", String(i.id))} />
                ))}
              </section>
              <Thread item={current} today={data.today} onClose={() => setParam("c", null)} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ item: i, today, on, onClick }: { item: InboxItem; today: string; on: boolean; onClick: () => void }) {
  return (
    <button className={`ki-row${on ? " on" : ""}`} onClick={onClick}>
      <span className={`kb-dot s${i.needsReply ? i.severity || 1 : 0}`} style={i.needsReply ? undefined : { opacity: 0.3 }} />
      <span className="ki-main">
        <span className="ki-top">
          <b>{i.guestName}</b>
          {i.kind && <span className={`ki-tag s${i.severity}`}>{i.kind}</span>}
          {i.signOff && <span className="ki-tag">Thanks</span>}
          <span className="ki-time">{when(i.lastIncomingAt, today)}</span>
        </span>
        <span className="ki-msg">{i.lastMessage || <em>(open to read)</em>}</span>
        <span className="ki-who">
          {i.listingName ?? "Unknown property"}
          {i.group ? ` · ${i.group}` : ""}
        </span>
      </span>
      <span className={`ki-wait${i.needsReply && i.waitingMins > 60 ? " late" : ""}`}>
        {i.needsReply ? `waiting ${waited(i.waitingMins)}` : i.signOff ? "no reply needed" : "replied"}
      </span>
    </button>
  );
}

function Thread({ item, today, onClose }: { item: InboxItem | null; today: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ThreadMessage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setMsgs(null);
    setErr(null);
    if (!item) return;
    let live = true;
    fetch(`/api/inbox/${item.id}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!live) return;
        if (!ok) throw new Error(j.error || "Failed");
        setMsgs(j.messages);
      })
      .catch((e) => live && setErr(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      live = false;
    };
  }, [item]);

  if (!item) {
    return (
      <section className="kb-card ki-thread ki-thread-empty">
        <p>Pick a conversation to read the whole thread.</p>
      </section>
    );
  }
  return (
    <section className="kb-card ki-thread">
      <div className="ki-thread-head">
        <div>
          <h3>{item.guestName}</h3>
          <p className="kb-sub" style={{ margin: 0 }}>
            {item.listingName ?? "Unknown property"}
            {item.group ? ` · ${item.group}` : ""}
          </p>
        </div>
        <button className="kb-area-clear" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="ki-status">
        {item.kind && <span className={`ki-tag s${item.severity}`}>{item.kind}</span>}
        <span className={item.needsReply ? "kb-down" : ""}>
          {item.needsReply ? `Waiting on us · ${waited(item.waitingMins)}` : item.signOff ? "Guest signed off, no reply needed" : "We replied last"}
        </span>
      </div>
      <div className="ki-msgs">
        {!msgs && !err && <div className="kb-empty">Loading messages…</div>}
        {err && <div className="kb-empty">Couldn&apos;t load the thread: {err}</div>}
        {msgs?.length === 0 && <div className="kb-empty">No messages found.</div>}
        {msgs?.map((m, k) => (
          <div key={k} className={`ki-bubble ${m.incoming ? "in" : "out"}`}>
            <div>{m.body}</div>
            <span>{m.incoming ? item.guestName.split(" ")[0] : "Keapr"} · {when(m.at, today)}</span>
          </div>
        ))}
      </div>
      <p className="ki-foot">Reply from Hostaway. This board is read-only.</p>
    </section>
  );
}
