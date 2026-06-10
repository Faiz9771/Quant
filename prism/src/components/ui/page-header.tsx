import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "relative mb-7 flex flex-col gap-5 pb-7 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-3">
        {eyebrow && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-soft/60 px-2.5 py-[3px] text-[10px] font-semibold uppercase tracking-[0.14em] text-brand ring-1 ring-inset ring-brand/15">
            <span className="h-1 w-1 rounded-full bg-brand" />
            {eyebrow}
          </span>
        )}
        <h1 className="text-display text-foreground">{title}</h1>
        {description && (
          <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:pt-1.5">
          {actions}
        </div>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />
    </header>
  );
}
