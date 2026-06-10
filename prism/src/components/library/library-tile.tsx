"use client";

import * as React from "react";
import { ArrowUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface LibraryTileProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  meta?: string;
  busy?: boolean;
  secondary?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
}

export function LibraryTile({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
  meta,
  busy,
  secondary,
}: LibraryTileProps) {
  return (
    <Card className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent"
      />
      <CardHeader className="gap-3.5 px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-soft to-brand-soft/30 text-brand ring-1 ring-inset ring-brand/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
            {icon}
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-card"
            />
          </div>
          {meta && (
            <span className="inline-flex items-center rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground ring-1 ring-inset ring-border/60">
              {meta}
            </span>
          )}
        </div>
        <CardTitle className="text-[15px] font-semibold tracking-[-0.01em] leading-tight">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 px-5 pb-5">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
        <div className="mt-auto flex flex-col gap-1.5">
          <Button
            type="button"
            variant="brand"
            size="sm"
            onClick={onClick}
            disabled={busy}
            className="w-full justify-between"
          >
            <span>{buttonLabel}</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              {secondary.icon}
              {secondary.label}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface TileModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  size?: "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const SIZE_TO_MAX_W: Record<NonNullable<TileModalProps["size"]>, string> = {
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function TileModal({
  title,
  description,
  onClose,
  size = "md",
  children,
  footer,
}: TileModalProps) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/25 p-6 backdrop-blur-[2px] animate-fade-in-up"
      onClick={onClose}
    >
      <div
        className={cn(
          "my-8 w-full rounded-3xl bg-card text-card-foreground shadow-pop ring-1 ring-black/[0.05] surface-gradient animate-scale-in",
          SIZE_TO_MAX_W[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/50 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {title}
            </h3>
            {description && (
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border/50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
