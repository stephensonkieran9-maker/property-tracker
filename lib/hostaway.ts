import type { Listing } from "./types";
import { mockListings } from "./mock";

const BASE = "https://api.hostaway.com/v1";

export function isDemo(): boolean {
  if (process.env.DEMO_MODE === "1") return true;
  return !process.env.HOSTAWAY_ACCOUNT_ID || !process.env.HOSTAWAY_API_KEY;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// Access tokens are long-lived; cache within the serverless instance.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.HOSTAWAY_ACCOUNT_ID!,
    client_secret: process.env.HOSTAWAY_API_KEY!,
    scope: "general",
  });

  const res = await fetch(`${BASE}/accessTokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Hostaway auth failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as TokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

interface HostawayListing {
  id: number;
  name?: string;
  internalListingName?: string;
  externalListingName?: string;
  city?: string;
  /** e.g. "2025-05-15 14:04:53" */
  insertedOn?: string;
}

/** Fetch the full property roster, following pagination. */
export async function fetchAllListings(): Promise<Listing[]> {
  if (isDemo()) return mockListings();

  const token = await getToken();
  const limit = 100;
  let offset = 0;
  const out: Listing[] = [];

  // Safety cap: 50 pages = 5,000 listings.
  for (let page = 0; page < 50; page++) {
    const url = `${BASE}/listings?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Hostaway listings failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as { result?: HostawayListing[] };
    const batch = json.result ?? [];
    for (const l of batch) {
      out.push({
        id: l.id,
        name: l.name || l.externalListingName || l.internalListingName || `Listing ${l.id}`,
        city: l.city,
        onboardedAt: (l.insertedOn ?? "").slice(0, 10),
      });
    }

    if (batch.length < limit) break;
    offset += limit;
  }

  return out;
}
