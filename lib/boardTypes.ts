// Raw shapes the board is computed from. Real data (Hostaway) and demo data
// are both mapped into these, so the maths in lib/board.ts is shared.

export interface Unit {
  id: number;
  name: string;
  /** Grouping shown as filter pills and heatmap rows (building / area). */
  group: string;
  onboardedAt: string; // YYYY-MM-DD
}

export interface Reservation {
  id: number;
  listingId: number;
  listingName: string;
  guestName: string;
  arrival: string; // YYYY-MM-DD
  departure: string; // YYYY-MM-DD
  /** When the booking was made, London time, "YYYY-MM-DD HH:mm". */
  bookedOn: string;
  cancelledOn?: string; // YYYY-MM-DD
  total: number; // GBP
  status: "confirmed" | "cancelled";
  channel?: string;
  checkInTime?: number; // hour, if Hostaway has it
  /** Channel commission taken by Airbnb / Booking.com etc. (GBP), if Hostaway has it. */
  commission?: number;
  cleaningFee?: number;
  tax?: number;
}

export interface Conversation {
  id: number;
  guestName: string;
  listingId?: number;
  listingName?: string;
  /** Latest message from the guest, London time "YYYY-MM-DD HH:mm". */
  lastIncomingAt?: string;
  lastOutgoingAt?: string;
  /** Text of the latest guest message. */
  lastMessage: string;
}

export interface RawData {
  units: Unit[];
  reservations: Reservation[];
  conversations: Conversation[];
  /** Properties that dropped out of Hostaway (snapshot diff). */
  losses: Array<{ date: string; id: number; name: string; group?: string }>;
}

// ── Computed board ──────────────────────────────────────────

export type ProblemKind =
  | "Access"
  | "Maintenance"
  | "Refund"
  | "Complaint"
  | "Cancellation"
  | "Noise"
  | "WiFi"
  | "Unanswered";

export interface Problem {
  conversationId: number;
  kind: ProblemKind;
  severity: 1 | 2 | 3; // 3 = urgent
  guestName: string;
  listingName?: string;
  group?: string;
  message: string;
  receivedAt: string;
  unanswered: boolean;
  /** Minutes since the guest's message. */
  waitingMins: number;
}

export interface TargetProgress {
  team: string;
  label: string;
  actual: number;
  target: number;
  format: "gbp" | "int" | "pct";
  lowerIsBetter?: boolean;
  /** Where we "should" be by today if pacing evenly through the month (null for point-in-time targets). */
  pace: number | null;
  status: "ahead" | "on-track" | "behind";
}

export interface Board {
  demo: boolean;
  generatedAt: string;
  today: string;
  greetingName: string;
  groups: string[];
  /** Number of properties in each area. */
  groupSizes: Record<string, number>;
  group: string; // "All" or a group

  tonight: {
    occupancyPct: number;
    occupied: number;
    units: number;
    /** Change vs same night last week, in percentage points. */
    vsLastWeekPts: number;
    lastWeekDay: string; // e.g. "Thu"
    arriving: number;
    firstArrival: string | null;
    leaving: number;
    byGroup: Array<{ group: string; pct: number; occupied: number; units: number }>;
  };

  today_: {
    bookings: number;
    cancelled: number;
    revenue: number;
    last24hRevenue: number;
    last24hBookings: number;
  };

  inbox: {
    unanswered: number;
    oldestUnanswered: string | null;
    problems: Problem[];
  };

  month: {
    key: string; // YYYY-MM
    label: string; // "November 2026"
    isCurrent: boolean;
    bookings: number;
    cancelled: number;
    revenue: number;
    /** Revenue from nights stayed in the month (by stay date). */
    stayRevenue: number;
    nightsSold: number;
    occupancyPct: number;
    adr: number;
    /** Year-to-date booked revenue up to the end of this month (or today). */
    runningTotal: number;
    runningTotalLabel: string;
    prevMonthRevenue: number;
    /** Per-day series for the month. */
    daily: Array<{ date: string; bookings: number; revenue: number; cumulative: number }>;
    /** Occupancy for every night of the month (future nights = on the books so far). */
    nightly: Array<{ date: string; pct: number; future: boolean }>;
    onboardedUnits: Array<{ name: string; group: string; date: string }>;
    daysInMonth: number;
    revenueTarget: number;
  };

  next14: {
    dates: string[];
    rows: Array<{ group: string; units: number; kind: "total" | "area" | "property"; pcts: number[] }>;
    target: number;
  };

  portfolio: {
    units: number;
    onboardedThisMonth: number;
    lostThisMonth: number;
  };

  targets: TargetProgress[];

  /** Per-person targets from the Google Sheet (pulled daily). */
  people: {
    source: "sheet" | "default";
    error?: string;
    rows: Array<{
      person: string;
      team?: string;
      target: number;
      actual: number | null;
      format: "gbp" | "int" | "pct";
      pace: number | null;
      status: "ahead" | "on-track" | "behind" | "pending";
    }>;
  };
}
