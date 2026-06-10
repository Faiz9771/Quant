"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  label: string;
  value: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "All",
  searchable = true,
  disabled = false,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(v: string) {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  const valueSet = React.useMemo(() => new Set(value), [value]);
  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label || value[0]
        : `${value.length} selected`;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "press flex h-9 w-full items-center justify-between rounded-xl bg-card px-3 text-[13px] text-foreground shadow-xs ring-1 ring-inset ring-border transform-gpu transition-all duration-200 ease-out-soft",
          "hover:ring-border hover:bg-accent/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          value.length > 0 && "ring-brand/30 bg-brand-soft/40"
        )}
      >
        <span
          className={cn(
            "truncate",
            value.length === 0 && "text-muted-foreground"
          )}
        >
          {summary}
        </span>
        <span className="flex items-center gap-1.5 ml-2">
          {value.length > 0 && !disabled && (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={clear}
            >
              <X className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ease-out-soft",
              open && "rotate-180"
            )}
          />
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-72 origin-top overflow-hidden rounded-xl bg-popover shadow-pop ring-1 ring-black/[0.06] animate-scale-in">
          {searchable && (
            <div className="border-b border-border/60 p-1.5">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-8 w-full rounded-md bg-muted px-2.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-all focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/30"
                autoFocus
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-center text-[12.5px] text-muted-foreground">
                No matches
              </div>
            )}
            {filtered.map((o) => {
              const isSel = valueSet.has(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors duration-100",
                    isSel
                      ? "bg-brand-soft/60 text-foreground"
                      : "text-foreground hover:bg-accent"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ring-1 ring-inset transition-all duration-150",
                      isSel
                        ? "bg-brand text-white ring-brand shadow-sm"
                        : "bg-card ring-border"
                    )}
                  >
                    {isSel && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
