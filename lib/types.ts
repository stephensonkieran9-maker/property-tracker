export interface Listing {
  id: number;
  name: string;
  city?: string;
  /** Date the property was onboarded in Hostaway (YYYY-MM-DD, from insertedOn). */
  onboardedAt: string;
}

/** A property being brought on, for the onboarding feed. */
export interface OnboardEvent {
  date: string;
  id: number;
  name: string;
  city?: string;
}

/** A property that disappeared from Hostaway (detected by snapshot diff). */
export interface LossEvent {
  /** Date we first noticed it was gone (YYYY-MM-DD). */
  date: string;
  id: number;
  name: string;
  city?: string;
}

export interface DashboardData {
  current: {
    count: number;
    listings: Listing[];
  };
  /** Cumulative property count over time, oldest → newest. */
  history: Array<{ date: string; count: number }>;
  /** Onboardings, newest first. */
  onboardings: OnboardEvent[];
  /** Losses detected via snapshot diff, newest first (empty until tracking is on). */
  losses: LossEvent[];
  stats: {
    total: number;
    thisMonth: number;
    prevMonth: number;
    last30: number;
    /** Date of the first onboarding we can see (YYYY-MM-DD). */
    sinceFirst: string | null;
    /** Properties lost this calendar month. */
    lostThisMonth: number;
    /** Total losses recorded since tracking began. */
    lostTotal: number;
    /** Net change this month (brought on − lost). */
    netThisMonth: number;
    /** Date loss-tracking started (null if not tracking yet). */
    trackingSince: string | null;
  };
  demo: boolean;
  generatedAt: string;
}
