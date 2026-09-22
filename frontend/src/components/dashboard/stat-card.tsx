import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

import { Panel } from "@/components/shared/panel";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon: LucideIcon;
  /** Use the mono data face for the value (money). */
  mono?: boolean;
}

export function StatCard({ label, value, detail, icon: Icon, mono }: StatCardProps) {
  return (
    <Panel className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p
        className={cn(
          "mt-3 leading-none text-foreground",
          mono
            ? "font-mono text-[26px] font-medium tracking-[-0.02em]"
            : "font-heading text-[36px] font-medium tracking-[-0.02em]",
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-2.5 text-[12.5px] text-muted-foreground">{detail}</p>}
    </Panel>
  );
}
