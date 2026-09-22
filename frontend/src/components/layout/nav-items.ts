import { CalendarClock, LayoutDashboard, ReceiptText, Stethoscope, Users } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/schedule", label: "Schedule", icon: CalendarClock },
  { href: "/billing", label: "Billing", icon: ReceiptText },
  { href: "/therapists", label: "Therapists", icon: Stethoscope },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
