import { AlertTriangle, Info } from "lucide-react";
import { cn } from "cn";

interface InlineAlertProps {
  tone?: "danger" | "warning" | "neutral";
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const TONES = {
  danger: "border-danger/25 bg-danger-soft text-danger",
  warning: "border-primary/30 bg-primary-soft text-primary-ink",
  neutral: "border-neutral/20 bg-neutral-soft text-neutral",
};

/** Contextual message inside a form or panel (conflicts, blocked actions). */
export function InlineAlert({ tone = "danger", title, children, className }: InlineAlertProps) {
  const Icon = tone === "neutral" ? Info : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-2.5 rounded-lg border px-3.5 py-3 text-[13px]",
        TONES[tone],
        className,
      )}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? "opacity-90" : undefined}>{children}</div>
      </div>
    </div>
  );
}
