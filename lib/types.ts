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

export interface DashboardData {
  current: {
    count: number;
    listings: Listing[];
  };
  /** Cumulative property count over time, oldest → newest. */
  history: Array<{ date: string; count: number }>;
  /** Onboardings, newest first. */
  onboardings: OnboardEvent[];
  stats: {
    total: number;
    thisMonth: number;
    prevMonth: number;
    last30: number;
    /** Date of the first onboarding we can see (YYYY-MM-DD). */
    sinceFirst: string | null;
  };
  demo: boolean;
  generatedAt: string;
}
