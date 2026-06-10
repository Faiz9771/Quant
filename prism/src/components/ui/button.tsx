import * as React from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "default"
  | "outline"
  | "ghost"
  | "danger"
  | "subtle"
  | "brand";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantStyles: Record<Variant, string> = {
  // Primary — charcoal with inner top highlight + layered shadow.
  default:
    "bg-primary text-primary-foreground shadow-e2 ring-1 ring-inset ring-white/[0.08] edge-highlight-dark hover:bg-primary/92 hover:shadow-e3 active:bg-primary active:shadow-e1 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:ring-0",
  // Brand — olive / sage.
  brand:
    "bg-[#b3b788] text-[#2a2a1f] shadow-e1 ring-1 ring-inset ring-black/[0.08] edge-highlight hover:bg-[#a1a57a] hover:shadow-e2 active:bg-[#8e9369] active:shadow-e1 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
  // Outline — warm card with hairline ring.
  outline:
    "bg-card text-foreground shadow-e1 ring-1 ring-inset ring-border/80 hover:bg-accent/50 hover:ring-border active:bg-accent active:shadow-none disabled:opacity-50",
  ghost:
    "bg-transparent text-muted-foreground hover:bg-accent/70 hover:text-foreground active:bg-accent disabled:opacity-50",
  danger:
    "bg-[hsl(0_65%_55%)] text-white shadow-e2 ring-1 ring-inset ring-white/15 edge-highlight-dark hover:bg-[hsl(0_65%_50%)] hover:shadow-e3 active:bg-[hsl(0_65%_45%)] active:shadow-e1 disabled:opacity-40 disabled:shadow-none",
  subtle:
    "bg-secondary text-secondary-foreground ring-1 ring-inset ring-border/40 hover:bg-accent active:bg-accent disabled:opacity-50",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5 rounded-lg",
  md: "h-9 px-4 text-[13px] gap-2 rounded-xl",
  lg: "h-11 px-5 text-[14px] gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-xl",
  "icon-sm": "h-8 w-8 rounded-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "press inline-flex select-none items-center justify-center font-medium tracking-[-0.006em] transform-gpu",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
