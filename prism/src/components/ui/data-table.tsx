import * as React from "react";
import { cn } from "@/lib/utils";

export function DataTable({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn(
        "w-full border-separate border-spacing-0 text-[13px] tnum",
        className
      )}
      {...props}
    >
      {children}
    </table>
  );
}

export function DataTableHead({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "sticky top-0 z-10 glass",
        "[&_th]:border-b [&_th]:border-border/60",
        className
      )}
      {...props}
    >
      {children}
    </thead>
  );
}

export function DataTableHeader({
  className,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "select-none px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function DataTableBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn(
        "[&_tr]:transition-colors [&_tr]:duration-100",
        "[&_tr:hover]:bg-accent/40",
        "[&_td]:border-b [&_td]:border-border-soft",
        className
      )}
      {...props}
    >
      {children}
    </tbody>
  );
}

export function DataTableCell({
  className,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-4 py-3 text-foreground/90", className)}
      {...props}
    >
      {children}
    </td>
  );
}

export function DataTableWrapper({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-auto rounded-2xl bg-card shadow ring-1 ring-black/[0.04]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
