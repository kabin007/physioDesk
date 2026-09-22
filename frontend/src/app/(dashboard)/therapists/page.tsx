import type { Metadata } from "next";

import { TherapistsView } from "@/components/therapists/therapists-view";

export const metadata: Metadata = { title: "Therapists" };

export default function TherapistsPage() {
  return <TherapistsView />;
}
