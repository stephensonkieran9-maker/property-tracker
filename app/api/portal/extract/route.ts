import { NextResponse } from "next/server";
import { requireMember } from "@/lib/portal/auth";
import { extractOffer, ExtractError } from "@/lib/portal/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const auth = await requireMember();
  if ("res" in auth) return auth.res;

  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a screenshot to upload." }, { status: 400 });
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: "That file isn't an image (PNG, JPG or WebP)." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is too large (max 4 MB)." }, { status: 400 });

  try {
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const fields = await extractOffer(b64, file.type);
    return NextResponse.json({ fields });
  } catch (e) {
    const msg = e instanceof ExtractError ? e.message : "Couldn't read the screenshot. Try again, or type the details in.";
    if (!(e instanceof ExtractError)) console.error("[extract]", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
