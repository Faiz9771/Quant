import Link from "next/link";
import {
  Activity,
  BarChart3,
  Building2,
  LayoutDashboard,
  Library,
  LogOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PrismLogo } from "@/components/prism-logo";
import { cn } from "@/lib/utils";

export interface NavBarProps {
  lastUpdated?: string | null;
  active?: "dashboard" | "ratings" | "office" | "models" | "library";
}

export function NavBar({ lastUpdated, active }: NavBarProps) {
  const items: {
    href: string;
    label: string;
    key: NonNullable<NavBarProps["active"]>;
    icon: React.ReactNode;
  }[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      key: "dashboard",
      icon: <LayoutDashboard className="h-[18px] w-[18px]" />,
    },
    {
      href: "/",
      label: "Ratings",
      key: "ratings",
      icon: <BarChart3 className="h-[18px] w-[18px]" />,
    },
    {
      href: "/office",
      label: "Office",
      key: "office",
      icon: <Building2 className="h-[18px] w-[18px]" />,
    },
    {
      href: "/live-validation",
      label: "Models",
      key: "models",
      icon: <Activity className="h-[18px] w-[18px]" />,
    },
    {
      href: "/library",
      label: "Library",
      key: "library",
      icon: <Library className="h-[18px] w-[18px]" />,
    },
  ];

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 flex w-[232px] flex-col overflow-hidden border-r border-border bg-card text-foreground">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <PrismLogo size={40} tone="light" />
        <span className="text-[20px] font-semibold tracking-[-0.02em] text-foreground">
          Prism
        </span>
      </div>

      {/* Navigation items */}
      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {items.map((item) => {
          const isActive = active === item.key;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium tracking-[-0.008em] transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                isActive
                  ? "bg-brand-soft text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand" />
              )}
              <span
                className={cn(
                  "flex h-[18px] w-[18px] items-center justify-center transition-colors",
                  isActive
                    ? "text-brand"
                    : "text-muted-foreground/80 group-hover:text-foreground"
                )}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer — user + actions */}
      <div className="flex flex-col gap-1 border-t border-border-soft px-3 py-3">
        {lastUpdated && (
          <div className="flex items-center gap-2 px-3 pb-1 text-[10px] font-mono text-muted-foreground">
            <span className="h-1 w-1 animate-pulse rounded-full bg-brand" />
            <span className="truncate">Synced · {lastUpdated}</span>
          </div>
        )}
        <div className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[10.5px] font-semibold text-brand-foreground">
            FM
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[12px] font-semibold text-foreground">
              MarketSmith
            </span>
            <span className="truncate text-[10px] text-muted-foreground">
              Analyst
            </span>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// Keep Badge importable from this module's dependency graph (unused warning suppression).
void Badge;
