import { Suspense } from "react";
import Finance from "../components/Finance";

export default function FinancePage() {
  return (
    <Suspense>
      <Finance />
    </Suspense>
  );
}
