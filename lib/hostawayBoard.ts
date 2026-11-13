// Hostaway fetchers for the board: reservations and guest conversations.
// Field names follow Hostaway's public API v1; every field is read defensively
// so a missing value never breaks the board.
import { BASE, getToken } from "./hostaway";
import type { Conversation, Reservation } from "./boardTypes";

async function get<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Hostaway ${path.split("?")[0]} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Hostaway gives "YYYY-MM-DD HH:mm:ss"; trim to "YYYY-MM-DD HH:mm". */
const stamp = (s?: string | null) => (s ? s.replace("T", " ").slice(0, 16) : undefined);

interface HReservation {
  id: number;
  listingMapId?: number;
  listingName?: string;
  guestName?: string;
  guestFirstName?: string;
  guestLastName?: string;
  arrivalDate?: string;
  departureDate?: string;
  reservationDate?: string;
  insertedOn?: string;
  cancellationDate?: string | null;
  totalPrice?: number | string;
  status?: string;
  channelName?: string;
  checkInTime?: number | null;
  channelCommissionAmount?: number | string | null;
  hostChannelFee?: number | string | null;
  cleaningFee?: number | string | null;
  taxAmount?: number | string | null;
}

const optNum = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// Statuses that count as a real, live stay.
const LIVE = new Set(["new", "modified", "ownerStay"]);

/**
 * All reservations arriving between `from` and `to` (YYYY-MM-DD), paginated.
 * Inquiries, declined and expired requests are dropped.
 */
export async function fetchReservations(from: string, to: string): Promise<Reservation[]> {
  const out: Reservation[] = [];
  const limit = 100;
  for (let page = 0; page < 200; page++) {
    const q = `limit=${limit}&offset=${page * limit}&arrivalStartDate=${from}&arrivalEndDate=${to}`;
    const json = await get<{ result?: HReservation[] }>(`/reservations?${q}`);
    const batch = json.result ?? [];
    for (const r of batch) {
      const status = r.status ?? "";
      const cancelled = status === "cancelled";
      if (!cancelled && !LIVE.has(status)) continue;
      if (status === "ownerStay") continue; // owner stays don't earn revenue
      if (!r.arrivalDate || !r.departureDate) continue;
      out.push({
        id: r.id,
        listingId: r.listingMapId ?? 0,
        listingName: r.listingName ?? `Listing ${r.listingMapId ?? ""}`,
        guestName:
          r.guestName || [r.guestFirstName, r.guestLastName].filter(Boolean).join(" ") || "Guest",
        arrival: r.arrivalDate.slice(0, 10),
        departure: r.departureDate.slice(0, 10),
        bookedOn: stamp(r.reservationDate) ?? stamp(r.insertedOn) ?? r.arrivalDate.slice(0, 10) + " 00:00",
        cancelledOn: r.cancellationDate ? r.cancellationDate.slice(0, 10) : undefined,
        total: Number(r.totalPrice) || 0,
        status: cancelled ? "cancelled" : "confirmed",
        channel: r.channelName,
        checkInTime: r.checkInTime ?? undefined,
        commission: optNum(r.channelCommissionAmount) ?? optNum(r.hostChannelFee),
        cleaningFee: optNum(r.cleaningFee),
        tax: optNum(r.taxAmount),
      });
    }
    if (batch.length < limit) break;
  }
  return out;
}

interface HConversation {
  id: number;
  listingMapId?: number;
  reservationId?: number;
  recipientName?: string;
  messageReceivedOn?: string | null;
  messageSentOn?: string | null;
  Reservation?: { guestName?: string; listingName?: string; listingMapId?: number } | null;
}

interface HMessage {
  body?: string;
  isIncoming?: number | boolean;
  insertedOn?: string;
  date?: string;
}

/**
 * Recent guest conversations. For the ones where the guest spoke last (or
 * recently), we also pull the latest guest message so problems can be spotted.
 */
export async function fetchConversations(sinceStamp: string): Promise<Conversation[]> {
  const json = await get<{ result?: HConversation[] }>(
    `/conversations?limit=100&offset=0&includeResources=1`
  );
  const convs = (json.result ?? [])
    .filter((c) => (stamp(c.messageReceivedOn) ?? "") >= sinceStamp)
    .sort((a, b) => (stamp(b.messageReceivedOn) ?? "").localeCompare(stamp(a.messageReceivedOn) ?? ""));

  // Pull message text for the 60 most recent, 10 at a time, to stay inside Hostaway's rate limits.
  const WITH_TEXT = 60;
  const results: Conversation[] = [];
  for (let i = 0; i < convs.length; i += 10) {
    const batch = await Promise.all(convs.slice(i, i + 10).map((c, j) => toConversation(c, i + j < WITH_TEXT)));
    results.push(...batch);
  }
  return results;
}

async function toConversation(c: HConversation, withText: boolean): Promise<Conversation> {
      let lastMessage = "";
      if (withText) try {
        const m = await get<{ result?: HMessage[] }>(`/conversations/${c.id}/messages?limit=10`);
        const incoming = (m.result ?? [])
          .filter((x) => x.isIncoming === 1 || x.isIncoming === true)
          .sort((a, b) => (b.insertedOn ?? b.date ?? "").localeCompare(a.insertedOn ?? a.date ?? ""));
        lastMessage = (incoming[0]?.body ?? "").trim();
      } catch {
        /* message fetch is best-effort */
      }
      return {
        id: c.id,
        guestName: c.Reservation?.guestName || c.recipientName || "Guest",
        listingId: c.listingMapId ?? c.Reservation?.listingMapId,
        listingName: c.Reservation?.listingName,
        lastIncomingAt: stamp(c.messageReceivedOn),
        lastOutgoingAt: stamp(c.messageSentOn),
        lastMessage,
      };
}

/** Full message thread for one conversation, oldest first. */
export async function fetchThread(conversationId: number): Promise<Array<{ incoming: boolean; at: string; body: string }>> {
  const m = await get<{ result?: HMessage[] }>(`/conversations/${conversationId}/messages?limit=50`);
  return (m.result ?? [])
    .map((x) => ({
      incoming: x.isIncoming === 1 || x.isIncoming === true,
      at: stamp(x.insertedOn ?? x.date) ?? "",
      body: (x.body ?? "").trim(),
    }))
    .filter((x) => x.body)
    .sort((a, b) => a.at.localeCompare(b.at));
}
