"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  delayMs?: number;
}

/** Debounced search box: `onChange` fires once typing pauses. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  delayMs = 300,
}: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Follow external changes (e.g. "Clear filters") by adjusting state during render.
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  function update(next: string, immediate = false) {
    setDraft(next);
    clearTimeout(timer.current);
    if (immediate) onChange(next);
    else timer.current = setTimeout(() => onChange(next), delayMs);
  }

  return (
    <div className="relative w-full sm:w-72">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        aria-label={label}
        value={draft}
        onChange={(event) => update(event.target.value)}
        placeholder={placeholder}
        className="pr-8 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          onClick={() => update("", true)}
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
