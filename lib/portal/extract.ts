import "server-only";
import type { OfferFields } from "./types";

// Reads an offer screenshot with Claude and returns the fields for the person to check.
// The image is sent once and not stored anywhere.

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5";

const str = { type: ["string", "null"] };
const num = { type: ["number", "null"] };

const TOOL = {
  name: "record_offer",
  description: "Record the details of the accommodation offer shown in the screenshot.",
  input_schema: {
    type: "object",
    properties: {
      property_name: { type: "string", description: "Offered property's title, e.g. 'Next to Hammersmith Apollo + Tube | Top Location'" },
      address: { ...str, description: "Offered property's address" },
      apartment_type: { ...str, description: "e.g. '1 Bedroom (1 Bathroom)'" },
      location: { ...str, description: "The guest's requested location, e.g. 'Notting Hill, London, UK'" },
      check_in: { ...str, description: "Check-in date as YYYY-MM-DD" },
      check_out: { ...str, description: "Check-out date as YYYY-MM-DD" },
      nights: { ...num, description: "Number of nights as shown (not 'length of stay' days)" },
      adults: num,
      children: num,
      nightly_rate: { ...num, description: "Supplier rate per night in GBP, number only. If only a total is shown, divide by nights." },
      commission_pct: { ...num, description: "Commission percentage, number only (15% → 15)" },
      credit_terms_days: { ...num, description: "Credit terms in days" },
      company_contact: str,
    },
    required: ["property_name"],
  },
} as const;

const PROMPT = `This is a screenshot of an accommodation offer a booking agent sent to a client.
Read it and call record_offer. Copy values exactly as shown; use null for anything not visible.
Dates are UK format (day before month): "04 Jan 2027" → 2027-01-04, "04/03/2027" → 2027-03-04.
Use the offered property for property_name/address, and the requested location for location.`;

export class ExtractError extends Error {}

export async function extractOffer(imageBase64: string, mediaType: string): Promise<OfferFields> {
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!key) throw new ExtractError("Screenshot reading isn't set up yet (ANTHROPIC_API_KEY is missing). You can still type the details in.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[extract] Anthropic ${res.status}: ${detail.slice(0, 500)}`);
    throw new ExtractError(
      res.status === 401 ? "The Anthropic API key isn't valid. Check ANTHROPIC_API_KEY in Vercel." :
      res.status === 429 || res.status === 529 ? "Screenshot reading is busy. Try again in a moment." :
      "Couldn't read the screenshot. Try again, or type the details in."
    );
  }

  const json = (await res.json()) as { content?: Array<{ type: string; input?: Record<string, unknown> }> };
  const input = json.content?.find((c) => c.type === "tool_use")?.input;
  if (!input) throw new ExtractError("Couldn't find offer details in that screenshot.");
  return clean(input);
}

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown) => {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[£,%\s]/g, "")) : NaN;
  return Number.isFinite(x) && x >= 0 ? x : null;
};
const d = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function nightsBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const diff = Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400_000);
  return diff > 0 ? diff : null;
}

function clean(i: Record<string, unknown>): OfferFields {
  const check_in = d(i.check_in);
  const check_out = d(i.check_out);
  const nights = n(i.nights) ?? nightsBetween(check_in, check_out);
  return {
    property_name: s(i.property_name) ?? "",
    address: s(i.address),
    apartment_type: s(i.apartment_type),
    location: s(i.location),
    check_in,
    check_out,
    nights: nights !== null ? Math.round(nights) : null,
    adults: n(i.adults),
    children: n(i.children),
    nightly_rate: n(i.nightly_rate),
    commission_pct: n(i.commission_pct),
    credit_terms_days: n(i.credit_terms_days),
    company_contact: s(i.company_contact),
  };
}
