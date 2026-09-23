"use client";

import { ChevronsUpDown, LogOut, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogout, useSession } from "@/lib/auth/session";

import { Logo } from "./logo";
import { isActive, NAV_ITEMS } from "./nav-items";

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center px-5">
        <Link href="/" onClick={onNavigate} className="rounded-md" aria-label="PhysioDesk home">
          <Logo />
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 px-3 pt-3">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-sidebar-foreground/45 uppercase">
          Clinic
        </p>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors duration-150",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.25)]"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-white",
                  )}
                >
                  <Icon className="size-[17px] shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <UserMenu />
    </div>
  );
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function UserMenu() {
  const { user, isPending, isError, retry } = useSession();
  const logout = useLogout();

  return (
    <div className="border-t border-sidebar-border p-3">
      {!user && isError ? (
        <button
          type="button"
          onClick={retry}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent">
            <RefreshCw className="size-4 text-sidebar-foreground/70" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-white">
              Account unavailable
            </span>
            <span className="block text-[11.5px] text-sidebar-foreground/55">Retry</span>
          </span>
        </button>
      ) : isPending || !user ? (
        <div className="flex items-center gap-3 px-2 py-1.5">
          <Skeleton className="size-8 rounded-full bg-sidebar-accent" />
          <Skeleton className="h-4 w-24 bg-sidebar-accent" />
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-ink">
              {initials(user.username)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-white capitalize">
                {user.username}
              </span>
              <span className="block text-[11.5px] text-sidebar-foreground/55">
                {user.role === "ADMIN" ? "Administrator" : "Staff"}
              </span>
            </span>
            <ChevronsUpDown className="size-4 text-sidebar-foreground/50" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-[13px] font-medium text-foreground">{user.username}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
