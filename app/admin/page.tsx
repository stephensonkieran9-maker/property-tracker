import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/portal/auth";
import Admin from "../components/portal/Admin";
import Gate from "../components/portal/Gate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Keapr · Offers admin" };

export default async function AdminPage() {
  const access = await getAccess();
  if (access.kind === "signed-out") redirect("/login?next=/admin");
  if (access.kind !== "ok" || access.me.role !== "admin") return <Gate access={access} adminOnly />;
  return <Admin me={access.me} />;
}
