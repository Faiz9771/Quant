import * as React from "react";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** When true, applies a subtle hover lift. Default false. */
  interactive?: boolean;
  /** When true, removes the inner gradient and uses a flat surface. */
  flat?: boolean;
  /** Visual tone for the card — cream (default), olive (sage), or dark (charcoal). */
  tone?: "cream" | "olive" | "dark" | "amber" | "lavender";
}

export function Card({
  className,
  interactive = false,
  flat = false,
  tone = "cream",
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "relative rounded-3xl ring-1 shadow-e1",
        tone === "cream" &&
          "bg-card text-card-foreground ring-border/60 edge-highlight",
        tone === "olive" &&
          "bg-[#b3b788] text-[#2a2a1f] ring-black/[0.08] edge-highlight",
        tone === "dark" &&
          "bg-[#222222] text-white ring-white/[0.06] edge-highlight-dark",
        tone === "amber" &&
          "bg-[#efd184] text-[#3a2e14] ring-black/[0.08] edge-highlight",
        tone === "lavender" &&
          "bg-[#b3a9e6] text-[#1f1b3a] ring-black/[0.08] edge-highlight",
        !flat && tone === "cream" && "surface-gradient",
        interactive &&
          "transition-[transform,box-shadow] duration-300 ease-[var(--ease-soft)] hover:-translate-y-0.5 hover:shadow-e2",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 px-6 pt-6 pb-3", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "text-[14px] font-semibold tracking-[-0.01em] text-foreground",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-[12.5px] leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6 pt-1", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border/50 px-6 py-3.5",
        className
      )}
      {...props}
    />
  );
}
