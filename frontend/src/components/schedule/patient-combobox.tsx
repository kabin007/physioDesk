"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listPatients } from "@/lib/api/patients";
import { queryKeys } from "@/lib/query/keys";
import type { PatientSummary } from "@/types/api";

interface PatientComboboxProps {
  id?: string;
  value: PatientSummary | null;
  onChange: (patient: PatientSummary) => void;
  invalid?: boolean;
}

/** Searches patients on the server (name or phone) rather than loading everyone. */
export function PatientCombobox({ id, value, onChange, invalid }: PatientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const filters = { page: 1, page_size: 8, search: debounced || undefined };

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.patients.list(filters),
    queryFn: () => listPatients(filters),
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="secondary"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className="w-full justify-between font-normal"
        >
          {value ? (
            <span className="truncate">{value.full_name}</span>
          ) : (
            <span className="text-muted-foreground">Search patients…</span>
          )}
          <ChevronsUpDown className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Name or phone…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{isFetching ? "Searching…" : "No patients found."}</CommandEmpty>
            <CommandGroup>
              {data?.items.map((patient) => (
                <CommandItem
                  key={patient.id}
                  value={patient.id}
                  onSelect={() => {
                    onChange({
                      id: patient.id,
                      full_name: patient.full_name,
                      phone: patient.phone,
                    });
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(value?.id === patient.id ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{patient.full_name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{patient.phone}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
