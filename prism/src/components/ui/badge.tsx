import * as React from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "neutral"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "primary"
  | "brand";

const tones: Record<Tone, string> = {
  neutral:
    "bg-secondary text-secondary-foreground",
  success:
    "bg-success-soft text-[hsl(145_55%_26%)]",
  danger:
    "bg-destructive-soft text-[hsl(0_65%_42%)]",
  warning:
    "bg-warning-soft text-[hsl(30_70%_32%)]",
  info:
    "bg-info-soft text-[hsl(210_50%_38%)]",
  primary:
    "bg-primary text-primary-foreground",
  brand:
    "bg-brand-soft text-[hsl(90_35%_28%)]",
};

const dotTones: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-success",
  danger: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  primary: "bg-primary-foreground",
  brand: "bg-brand",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Show a leading status dot (live indicator). */
  dot?: boolean;
  /** When true, the dot pulses (useful for "running"/"live" states). */
  pulse?: boolean;
}

export function Badge({
  className,
  tone = "neutral",
  dot = false,
  pulse = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none tracking-[-0.006em] ring-1 ring-inset ring-black/[0.04]",
        tones[tone],
        className
      )}
      {...props}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-50",
                dotTones[tone]
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex h-1.5 w-1.5 rounded-full",
              dotTones[tone]
            )}
          />
        </span>
      )}
      {children}
    </span>
  );
}
