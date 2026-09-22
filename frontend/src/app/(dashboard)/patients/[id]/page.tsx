import type { Metadata } from "next";

import { PatientProfile } from "@/components/patients/patient-profile";

export const metadata: Metadata = { title: "Patient" };

export default async function PatientPage({ params }: PageProps<"/patients/[id]">) {
  const { id } = await params;
  return <PatientProfile patientId={id} />;
}
