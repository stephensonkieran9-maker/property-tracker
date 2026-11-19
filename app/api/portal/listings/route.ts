import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { isDemo, fetchAllListings } from "@/lib/hostaway";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Keapr's Hostaway properties, for the "Managed" property picker. Names and areas only.
export async function GET() {
  const auth = await requireMember();
  if ("res" in auth) return auth.res;
  try {
    const listings = isDemo() ? await fetchAllListings() : (await getSnapshot()).listings;
    const out = listings
      .map((l) => ({ id: l.id, name: l.name, city: l.city ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ listings: out });
  } catch (e) {
    console.error("[portal/listings]", e);
    return NextResponse.json({ error: "Couldn't load properties from Hostaway." }, { status: 502 });
  }
}
