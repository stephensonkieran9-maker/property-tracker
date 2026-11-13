import type { ProblemKind } from "./boardTypes";
import { addDays, londonStamp, londonToday, minutesBetween } from "./dates";
import { classify, isAck, loadRaw } from "./board";
import { isDemo } from "./hostaway";
import { fetchThread } from "./hostawayBoard";
import { mockRawData } from "./mockBoard";

export interface InboxItem {
  id: number;
  guestName: string;
  listingName?: string;
  group?: string;
  lastMessage: string;
  lastIncomingAt?: string;
  lastOutgoingAt?: string;
  /** Guest spoke last and it isn't just a thank-you. */
  needsReply: boolean;
  /** Guest spoke last but only to say thanks / ok. */
  signOff: boolean;
  kind: ProblemKind | null;
  severity: 0 | 1 | 2 | 3;
  /** Minutes since the guest's latest message. */
  waitingMins: number;
}

export interface Inbox {
  demo: boolean;
  generatedAt: string;
  today: string;
  group: string;
  groups: string[];
  groupSizes: Record<string, number>;
  items: InboxItem[];
  stats: {
    total: number;
    needsReply: number;
    problems: number;
    urgent: number;
    oldestWaitMins: number | null;
    overHour: number;
    byKind: Record<string, number>;
  };
}

export async function getInbox(opts: { group?: string }): Promise<Inbox> {
  const today = londonToday();
  const now = londonStamp();
  const raw = await loadRaw(addDays(`${today.slice(0, 4)}-01-01`, -120));
  const groups = Array.from(new Set(raw.units.map((u) => u.group))).sort();
  const group = opts.group && groups.includes(opts.group) ? opts.group : "All";
  const unitById = new Map(raw.units.map((u) => [u.id, u]));

  const items: InboxItem[] = raw.conversations
    .filter((c) => c.lastIncomingAt)
    .map((c) => {
      const guestLast = !c.lastOutgoingAt || c.lastOutgoingAt < c.lastIncomingAt!;
      const signOff = guestLast && isAck(c.lastMessage);
      const hit = classify(c.lastMessage);
      return {
        id: c.id,
        guestName: c.guestName,
        listingName: c.listingName,
        group: c.listingId ? unitById.get(c.listingId)?.group : undefined,
        lastMessage: c.lastMessage,
        lastIncomingAt: c.lastIncomingAt,
        lastOutgoingAt: c.lastOutgoingAt,
        needsReply: guestLast && !signOff,
        signOff,
        kind: hit?.kind ?? null,
        severity: hit ? hit.severity : 0,
        waitingMins: Math.max(0, minutesBetween(c.lastIncomingAt!, now)),
      } as InboxItem;
    })
    .filter((i) => group === "All" || i.group === group)
    .sort(
      (a, b) =>
        Number(b.needsReply) - Number(a.needsReply) ||
        b.severity - a.severity ||
        (a.needsReply ? b.waitingMins - a.waitingMins : a.waitingMins - b.waitingMins)
    );

  const waiting = items.filter((i) => i.needsReply);
  const byKind: Record<string, number> = {};
  for (const i of items) if (i.kind) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;

  return {
    demo: isDemo(),
    generatedAt: raw.fetchedAt ? londonStamp(new Date(raw.fetchedAt)) : now,
    today,
    group,
    groups,
    groupSizes: Object.fromEntries(groups.map((g) => [g, raw.units.filter((u) => u.group === g).length])),
    items,
    stats: {
      total: items.length,
      needsReply: waiting.length,
      problems: items.filter((i) => i.kind).length,
      urgent: items.filter((i) => i.severity === 3 && i.needsReply).length,
      oldestWaitMins: waiting.length ? Math.max(...waiting.map((i) => i.waitingMins)) : null,
      overHour: waiting.filter((i) => i.waitingMins > 60).length,
      byKind,
    },
  };
}

export interface ThreadMessage {
  incoming: boolean;
  at: string;
  body: string;
}

export async function getThread(id: number): Promise<ThreadMessage[]> {
  if (!isDemo()) return fetchThread(id);
  // Demo: build a short believable thread around the latest guest message.
  const c = mockRawData().conversations.find((x) => x.id === id);
  if (!c || !c.lastIncomingAt) return [];
  const t = (mins: number) => {
    const base = new Date(c.lastIncomingAt!.replace(" ", "T") + ":00Z").getTime();
    return new Date(base + mins * 60000).toISOString().replace("T", " ").slice(0, 16);
  };
  const first = c.guestName.split(" ")[0];
  const msgs: ThreadMessage[] = [
    { incoming: false, at: t(-60 * 26), body: `Hi ${first}, welcome! Your check-in details and door code are in the guidebook. Any questions, just message here.` },
    { incoming: true, at: t(-60 * 25), body: "Lovely, thank you!" },
    { incoming: true, at: c.lastIncomingAt, body: c.lastMessage },
  ];
  if (c.lastOutgoingAt && c.lastOutgoingAt > c.lastIncomingAt) {
    msgs.push({ incoming: false, at: c.lastOutgoingAt, body: `Thanks ${first}, sorry about that — we're on it and will update you shortly.` });
  }
  return msgs;
}
