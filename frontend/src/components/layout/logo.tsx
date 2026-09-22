import { cn } from "cn";

/** Brand mark: a joint-and-arc motif (range of motion) in the primary colour. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--pd-primary)" />
      <path
        d="M9 22.5c1.6-6.4 5.6-10.5 12.5-12"
        fill="none"
        stroke="var(--pd-background)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="9" cy="22.5" r="2.6" fill="var(--pd-background)" />
      <circle cx="22.5" cy="10.3" r="2" fill="var(--pd-primary-soft)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-heading text-[19px] font-medium tracking-[-0.01em] text-white">
        PhysioDesk
      </span>
    </span>
  );
}
