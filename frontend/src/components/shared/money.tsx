import { cn } from "cn";

import { formatMoney } from "@/lib/format";

/** Monetary amount in IBM Plex Mono, formatted from the API's decimal string. */
export function Money({ value, className }: { value: string | number; className?: string }) {
  return <span className={cn("font-mono whitespace-nowrap", className)}>{formatMoney(value)}</span>;
}
