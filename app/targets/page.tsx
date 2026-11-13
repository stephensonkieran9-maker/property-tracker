import { Suspense } from "react";
import Targets from "../components/TargetsPage";

export default function TargetsRoute() {
  return (
    <Suspense>
      <Targets />
    </Suspense>
  );
}
