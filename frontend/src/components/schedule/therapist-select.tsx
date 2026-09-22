"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTherapists } from "@/hooks/use-therapists";

interface TherapistSelectProps {
  id?: string;
  value: string | undefined;
  onChange: (therapistId: string) => void;
  invalid?: boolean;
}

/** Active therapists only: inactive therapists cannot take bookings. */
export function TherapistSelect({ id, value, onChange, invalid }: TherapistSelectProps) {
  const { data = [] } = useTherapists();
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full">
        <SelectValue placeholder="Choose a therapist" />
      </SelectTrigger>
      <SelectContent position="popper">
        {data
          .filter((therapist) => therapist.is_active)
          .map((therapist) => (
            <SelectItem key={therapist.id} value={therapist.id}>
              {therapist.name}
              <span className="text-muted-foreground"> · {therapist.specialty}</span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
