import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/portal/auth";
import Portal from "../components/portal/Portal";
import Gate from "../components/portal/Gate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Keapr · Offers" };

export default async function PortalPage() {
  const access = await getAccess();
  if (access.kind === "signed-out") redirect("/login?next=/portal");
  if (access.kind !== "ok") return <Gate access={access} />;
  return <Portal me={access.me} />;
}
