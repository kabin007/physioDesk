import type { Metadata } from "next";

import { TherapistDetail } from "@/components/therapists/therapist-detail";

export const metadata: Metadata = { title: "Therapist" };

export default async function TherapistPage({ params }: PageProps<"/therapists/[id]">) {
  const { id } = await params;
  return <TherapistDetail therapistId={id} />;
}
