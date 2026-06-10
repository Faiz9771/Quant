"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Columns,
  Copy,
  Download,
  Plus,
  Rows,
  Save,
  Scissors,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  colLabel,
  evaluateCell,
  formatCell,
  type CellValue,
} from "@/lib/office/formula";
import { useOfficeStore } from "@/lib/office/store";
import { dialog } from "@/components/ui/dialog";

interface Props {
  docId: string;
}

export function SpreadsheetEditor({ docId }: Props) {
  const router = useRouter();
  const doc = useOfficeStore((s) => s.docs[docId]);
  const updateSpreadsheet = useOfficeStore((s) => s.updateSpreadsheet);
  const renameDoc = useOfficeStore((s) => s.renameDoc);
  const deleteDoc = useOfficeStore((s) => s.deleteDoc);

  const [selected, setSelected] = React.useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [editing, setEditing] = React.useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const hydrated = useOfficeStore((s) => s.hydrated);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-[1440px] px-8 py-8">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!doc || doc.kind !== "spreadsheet") {
    return (
      <div className="mx-auto max-w-[1440px] px-8 py-12 text-center">
        <h2 className="mb-2 text-xl font-semibold">Spreadsheet not found</h2>
        <p className="mb-6 text-[13.5px] text-muted-foreground">
          It may have been deleted, or the link is invalid.
        </p>
        <Link href="/office">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Office
          </Button>
        </Link>
      </div>
    );
  }

  const { cells, rows, cols, name } = doc;

  function setCell(r: number, c: number, value: string) {
    const next = cells.map((row) => row.slice());
    while (next.length <= r) next.push(Array.from({ length: cols }, () => ""));
    while (next[r].length <= c) next[r].push("");
    next[r][c] = value;
    updateSpreadsheet(docId, { cells: next });
    setSavedAt(Date.now());
  }

  function addRow(n = 1) {
    const count = Math.max(1, Math.floor(n));
    const next = cells.map((row) => row.slice());
    for (let i = 0; i < count; i++) {
      next.push(Array.from({ length: cols }, () => ""));
    }
    updateSpreadsheet(docId, { cells: next, rows: rows + count });
  }

  function addCol(n = 1) {
    const count = Math.max(1, Math.floor(n));
    const next = cells.map((row) => {
      const out = row.slice();
      for (let i = 0; i < count; i++) out.push("");
      return out;
    });
    updateSpreadsheet(docId, { cells: next, cols: cols + count });
  }

  async function promptAddRows() {
    const raw = await dialog.prompt({
      title: "Add rows",
      body: "How many rows would you like to add?",
      defaultValue: "10",
      confirmLabel: "Add",
      validate: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return "Enter a positive number.";
        return null;
      },
    });
    if (raw == null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    addRow(Math.min(5000, Math.floor(n)));
  }

  async function promptAddCols() {
    const raw = await dialog.prompt({
      title: "Add columns",
      body: "How many columns would you like to add?",
      defaultValue: "5",
      confirmLabel: "Add",
      validate: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return "Enter a positive number.";
        return null;
      },
    });
    if (raw == null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    addCol(Math.min(500, Math.floor(n)));
  }

  function deleteRow(r: number) {
    if (rows <= 1) return;
    const next = cells.filter((_, i) => i !== r);
    updateSpreadsheet(docId, { cells: next, rows: rows - 1 });
    if (selected.row >= rows - 1) setSelected({ row: rows - 2, col: selected.col });
  }

  function deleteCol(c: number) {
    if (cols <= 1) return;
    const next = cells.map((row) => row.filter((_, i) => i !== c));
    updateSpreadsheet(docId, { cells: next, cols: cols - 1 });
    if (selected.col >= cols - 1) setSelected({ row: selected.row, col: cols - 2 });
  }

  function startEdit(r: number, c: number, initial?: string) {
    setSelected({ row: r, col: c });
    setEditing({ row: r, col: c });
    setEditValue(initial !== undefined ? initial : (cells[r]?.[c] ?? ""));
  }

  function commitEdit() {
    if (!editing) return;
    setCell(editing.row, editing.col, editValue);
    setEditing(null);
    setEditValue("");
  }

  function cancelEdit() {
    setEditing(null);
    setEditValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editing) return;
    const { row, col } = selected;
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startEdit(row, col);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setCell(row, col, "");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected({ row: Math.max(0, row - 1), col });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected({ row: Math.min(rows - 1, row + 1), col });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSelected({ row, col: Math.max(0, col - 1) });
    } else if (e.key === "ArrowRight" || e.key === "Tab") {
      e.preventDefault();
      setSelected({ row, col: Math.min(cols - 1, col + 1) });
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      // Start typing — begin edit with this character.
      e.preventDefault();
      startEdit(row, col, e.key);
    }
  }

  async function onRename() {
    const next = await dialog.prompt({
      title: "Rename spreadsheet",
      defaultValue: name,
      confirmLabel: "Rename",
    });
    if (next && next.trim()) renameDoc(docId, next.trim());
  }

  async function onDelete() {
    const ok = await dialog.confirm({
      title: "Delete spreadsheet",
      body: `Delete "${name}"? This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    deleteDoc(docId);
    router.push("/office");
  }

  function exportCsv() {
    const rowsOut: string[] = [];
    for (let r = 0; r < rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < cols; c++) {
        const raw = cells[r]?.[c] ?? "";
        const v = raw.startsWith("=")
          ? formatCell(evaluateCell(r, c, { cells }))
          : raw;
        // Quote if contains comma/quote/newline.
        if (/[",\n]/.test(v)) row.push(`"${v.replace(/"/g, '""')}"`);
        else row.push(v);
      }
      rowsOut.push(row.join(","));
    }
    const blob = new Blob([rowsOut.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const currentRaw = cells[selected.row]?.[selected.col] ?? "";
  const currentDisplay = !currentRaw
    ? ""
    : currentRaw.startsWith("=")
      ? formatCell(evaluateCell(selected.row, selected.col, { cells }))
      : currentRaw;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 animate-fade-in-up">
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/office">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          </Link>
          <button
            onClick={onRename}
            className="press rounded-lg px-2 py-1 text-[18px] font-semibold tracking-[-0.02em] hover:bg-accent"
          >
            {name}
          </button>
          {savedAt && (
            <Badge tone="success" className="text-[10px]">
              <Save className="mr-1 h-2.5 w-2.5" />
              Saved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => (e.altKey || e.shiftKey ? promptAddRows() : addRow(1))}
            title="Click to add 1 row · Alt/Shift-click to add many"
          >
            <Rows className="h-3.5 w-3.5" />
            + Row
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={promptAddRows}
            title="Add N rows"
          >
            + N rows
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => (e.altKey || e.shiftKey ? promptAddCols() : addCol(1))}
            title="Click to add 1 column · Alt/Shift-click to add many"
          >
            <Columns className="h-3.5 w-3.5" />
            + Col
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={promptAddCols}
            title="Add N columns"
          >
            + N cols
          </Button>
          <Button variant="outline" size="sm" onClick={() => deleteRow(selected.row)}>
            <Trash2 className="h-3.5 w-3.5" />
            Del row
          </Button>
          <Button variant="outline" size="sm" onClick={() => deleteCol(selected.col)}>
            <Trash2 className="h-3.5 w-3.5" />
            Del col
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      {/* Formula bar */}
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-card p-2 shadow-xs ring-1 ring-inset ring-border">
        <span className="flex h-8 min-w-[56px] items-center justify-center rounded-lg bg-muted px-2 font-mono text-[12px] text-foreground">
          {colLabel(selected.col)}
          {selected.row + 1}
        </span>
        <span className="flex h-8 items-center gap-1 px-1 text-muted-foreground">
          <span className="font-mono text-[13px]">fx</span>
        </span>
        <input
          type="text"
          value={editing ? editValue : currentRaw}
          onChange={(e) => {
            if (editing) setEditValue(e.target.value);
            else {
              startEdit(selected.row, selected.col, e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
          onBlur={() => {
            if (editing) commitEdit();
          }}
          className="h-8 flex-1 rounded-lg bg-transparent px-2 font-mono text-[12.5px] focus:outline-none focus:ring-2 focus:ring-brand/40"
          placeholder='Type a value or =SUM(A1:A10)'
        />
        {currentRaw.startsWith("=") && (
          <span className="rounded-md bg-brand-soft px-2 py-1 font-mono text-[11px] text-[hsl(90_35%_28%)]">
            = {currentDisplay}
          </span>
        )}
      </div>

      {/* Grid */}
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="overflow-auto rounded-2xl bg-card shadow-sm ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-brand/30"
        style={{ maxHeight: "calc(100vh - 220px)" }}
      >
        <table className="border-separate border-spacing-0 text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-20 h-8 w-12 border-b border-r border-border bg-muted/80 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" />
              {Array.from({ length: cols }).map((_, c) => (
                <th
                  key={c}
                  className={cn(
                    "h-8 min-w-[110px] cursor-pointer border-b border-r border-border bg-muted/80 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:bg-accent",
                    selected.col === c && "bg-[#b3b788]/30 text-foreground"
                  )}
                  onClick={() => setSelected({ row: selected.row, col: c })}
                >
                  {colLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                <th
                  className={cn(
                    "sticky left-0 z-10 h-8 w-12 cursor-pointer border-b border-r border-border bg-muted/80 px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent",
                    selected.row === r && "bg-[#b3b788]/30 text-foreground"
                  )}
                  onClick={() => setSelected({ row: r, col: selected.col })}
                >
                  {r + 1}
                </th>
                {Array.from({ length: cols }).map((_, c) => {
                  const raw = cells[r]?.[c] ?? "";
                  const isSel = selected.row === r && selected.col === c;
                  const isEdit = editing?.row === r && editing.col === c;
                  const display = raw.startsWith("=")
                    ? formatCell(evaluateCell(r, c, { cells }))
                    : raw;
                  const isError = typeof display === "string" && display.startsWith("#");
                  const isNumeric =
                    raw !== "" &&
                    (raw.startsWith("=")
                      ? typeof display === "number" ||
                        (typeof display === "string" &&
                          Number.isFinite(Number(display)))
                      : Number.isFinite(Number(raw)));
                  return (
                    <td
                      key={c}
                      onMouseDown={(e) => {
                        if (isEdit) return;
                        // Fire on mousedown so it runs *before* the current
                        // edit's input blur — that way clicking from one cell
                        // to another drops straight into editing the new cell
                        // without needing a second click.
                        e.preventDefault();
                        startEdit(r, c);
                      }}
                      className={cn(
                        "relative h-8 cursor-cell border-b border-r border-border px-2 transition-colors",
                        isSel && !isEdit && "bg-[#b3b788]/15 outline outline-2 outline-[#6f7550] outline-offset-[-2px] z-[1]",
                        isError && "text-destructive",
                        isNumeric && "text-right font-mono tabular-nums"
                      )}
                    >
                      {isEdit ? (
                        <input
                          ref={(el) => {
                            if (el && document.activeElement !== el) {
                              el.focus();
                              el.select();
                            }
                          }}
                          value={editValue}
                          onMouseDown={(e) => e.stopPropagation()}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEdit();
                              const nextR = r + 1;
                              if (nextR < rows) startEdit(nextR, c);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              commitEdit();
                              const nextC = e.shiftKey ? c - 1 : c + 1;
                              if (nextC >= 0 && nextC < cols) startEdit(r, nextC);
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              commitEdit();
                              if (r > 0) startEdit(r - 1, c);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              commitEdit();
                              if (r < rows - 1) startEdit(r + 1, c);
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              commitEdit();
                              if (c > 0) startEdit(r, c - 1);
                            } else if (e.key === "ArrowRight") {
                              e.preventDefault();
                              commitEdit();
                              if (c < cols - 1) startEdit(r, c + 1);
                            }
                          }}
                          onBlur={() => {
                            // Only commit if we're still editing *this* cell.
                            // Tab/Enter already commit + move on synchronously;
                            // a late blur firing during that transition would
                            // otherwise null out the new cell's edit state.
                            if (editing && editing.row === r && editing.col === c) {
                              commitEdit();
                            }
                          }}
                          className="absolute inset-0 w-full bg-white px-2 font-mono text-[12.5px] ring-2 ring-[#6f7550] focus:outline-none"
                        />
                      ) : (
                        <span className="block truncate text-foreground/90">
                          {formatDisplay(display)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Help footer */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
        <span>
          Click a cell to type ·{" "}
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">
            Esc
          </kbd>{" "}
          cancel
        </span>
        <span>
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">
            Del
          </kbd>{" "}
          clear
        </span>
        <span>Formulas: =SUM(A1:B5), =AVERAGE, =IF(A1&gt;10, &quot;big&quot;, &quot;small&quot;), =A1*B2/C3</span>
      </div>
    </div>
  );
}

function formatDisplay(v: CellValue | string): React.ReactNode {
  if (v === "") return null;
  if (typeof v === "number") return formatCell(v);
  return String(v);
}

// Suppress unused import warnings for icons we may add later.
void Copy;
void Scissors;
void Plus;
