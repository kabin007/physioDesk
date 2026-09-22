import { Eye } from "lucide-react";

/** Shown to staff on areas they can view but not change (billing, therapists). */
export function ReadOnlyBadge() {
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-background px-2.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
      <Eye className="size-3" aria-hidden />
      View only
    </span>
  );
}
