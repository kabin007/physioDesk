import { Ban, Check, Clock3, Pause, X } from "lucide-react";
import { cn } from "cn";

import type { StatusIcon, Tone } from "@/lib/labels";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-neutral-soft text-neutral",
};

function Glyph({ icon }: { icon: StatusIcon }) {
  const className = "size-3 shrink-0";
  switch (icon) {
    case "check":
      return <Check className={className} strokeWidth={2.5} aria-hidden />;
    case "pause":
      return <Pause className={className} strokeWidth={2.5} aria-hidden />;
    case "clock":
      return <Clock3 className={className} strokeWidth={2.5} aria-hidden />;
    case "x":
      return <X className={className} strokeWidth={2.5} aria-hidden />;
    case "ban":
      return <Ban className={className} strokeWidth={2.5} aria-hidden />;
    default:
      return <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />;
  }
}

interface StatusBadgeProps {
  meta: { label: string; tone: Tone; icon: StatusIcon };
  className?: string;
}

/** Rounded status pill using the design system's status roles. */
export function StatusBadge({ meta, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[meta.tone],
        className,
      )}
    >
      <Glyph icon={meta.icon} />
      {meta.label}
    </span>
  );
}
