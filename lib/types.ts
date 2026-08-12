export interface Listing {
  id: number;
  name: string;
  address?: string;
  city?: string;
  status?: string;
}

/** One recorded point in time — the full property roster on that date. */
export interface Snapshot {
  /** YYYY-MM-DD (UTC) */
  date: string;
  count: number;
  listings: Array<Pick<Listing, "id" | "name">>;
}

/** A property that came in or went out between two snapshots. */
export interface ChangeEvent {
  date: string;
  type: "added" | "removed";
  id: number;
  name: string;
}

export interface DashboardData {
  /** Live count + roster from Hostaway right now. */
  current: {
    count: number;
    listings: Listing[];
  };
  /** Historical daily counts, oldest → newest. */
  history: Array<{ date: string; count: number }>;
  /** In/out feed, newest first. */
  changes: ChangeEvent[];
  /** Net change over the tracked window. */
  net: {
    added: number;
    removed: number;
    net: number;
    since: string | null;
  };
  demo: boolean;
  generatedAt: string;
}
