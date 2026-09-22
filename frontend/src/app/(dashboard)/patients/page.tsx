import type { Metadata } from "next";
import { Suspense } from "react";

import { PatientsView } from "@/components/patients/patients-view";

export const metadata: Metadata = { title: "Patients" };

export default function PatientsPage() {
  return (
    <Suspense>
      <PatientsView />
    </Suspense>
  );
}
