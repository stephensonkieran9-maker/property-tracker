import type { Metadata } from "next";
import { Suspense } from "react";
import Login from "../components/portal/Login";

export const metadata: Metadata = { title: "Keapr · Sign in" };

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
