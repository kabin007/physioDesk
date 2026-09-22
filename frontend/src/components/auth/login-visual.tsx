import { Logo } from "@/components/layout/logo";

/** Left panel of the login screen: brand, descriptor and a quiet movement-arc motif. */
export function LoginVisual() {
  return (
    <aside className="relative hidden overflow-hidden bg-secondary-dark lg:flex lg:flex-col lg:justify-between lg:p-12">
      <svg
        className="pointer-events-none absolute inset-0 size-full"
        viewBox="0 0 600 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="var(--pd-secondary-light)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="600" height="800" fill="url(#grid)" />
        {/* Range-of-motion arcs around a joint */}
        <g fill="none" stroke="var(--pd-primary)" strokeLinecap="round">
          <path d="M120 640 A 360 360 0 0 1 480 280" strokeOpacity="0.55" strokeWidth="1.5" />
          <path d="M120 640 A 280 280 0 0 1 400 360" strokeOpacity="0.35" strokeWidth="1.5" />
          <path d="M120 640 A 200 200 0 0 1 320 440" strokeOpacity="0.22" strokeWidth="1.5" />
          <path d="M120 640 L 480 280" strokeOpacity="0.18" strokeDasharray="4 8" />
        </g>
        <circle cx="120" cy="640" r="7" fill="var(--pd-primary)" />
        <circle cx="480" cy="280" r="4" fill="var(--pd-primary-soft)" />
      </svg>

      <Logo className="relative" />
      <div className="relative max-w-md">
        <p className="font-heading text-[40px] leading-[1.1] font-normal tracking-[-0.02em] text-white">
          Clinic operations, without the clutter.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-sidebar-foreground/65">
          Patients, therapist schedules, bookings and billing for your physiotherapy practice.
        </p>
      </div>
      <p className="relative text-xs text-sidebar-foreground/40">PhysioDesk</p>
    </aside>
  );
}
