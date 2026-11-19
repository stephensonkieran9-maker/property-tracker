// Shared between the server routes and the portal/admin screens.

export type Role = "staff" | "admin";
export type Model = "managed" | "arbitraged";
export type Outcome = "pending" | "won" | "lost";

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  monthlyTarget: number;
}

/** Fields read from the screenshot, then checked by the person before saving. */
export interface OfferFields {
  property_name: string;
  address: string | null;
  apartment_type: string | null;
  location: string | null;
  check_in: string | null; // YYYY-MM-DD
  check_out: string | null;
  nights: number | null;
  adults: number | null;
  children: number | null;
  nightly_rate: number | null;
  commission_pct: number | null;
  credit_terms_days: number | null;
  company_contact: string | null;
}

export interface Offer extends OfferFields {
  id: string;
  user_id: string;
  person?: string;
  nights: number;
  nightly_rate: number;
  booking_value: number;
  commission_value: number;
  model: Model;
  outcome: Outcome;
  outcome_at: string | null;
  notes: string | null;
  sent_at: string;
}

export interface Totals {
  sent: number;
  won: number;
  lost: number;
  pending: number;
  sentValue: number;
  wonValue: number;
  wonCommission: number;
}

export interface LeaderRow extends Totals {
  userId: string;
  name: string;
  winRate: number | null; // won ÷ (won + lost), 0–1
}

export interface Countdown {
  target: number;
  wonValue: number;
  remaining: number;
  /** Offers still to send at the current win rate; null when there isn't enough history yet. */
  offersNeeded: number | null;
  perDay: number | null;
  workdaysLeft: number;
  /** Average value won per offer decided (won or lost) — what each offer is "worth". */
  valuePerOffer: number | null;
  basis: "month" | "all-time" | "team" | null;
  sent: number;
  won: number;
  winRate: number | null;
  oneIn: number | null; // "1 in N offers accepted"
}

export const EMPTY_TOTALS: Totals = { sent: 0, won: 0, lost: 0, pending: 0, sentValue: 0, wonValue: 0, wonCommission: 0 };
