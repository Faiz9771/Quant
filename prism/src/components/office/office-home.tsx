"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckSquare,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  FileUp,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import {
  listDocs,
  listTodoLists,
  useOfficeStore,
} from "@/lib/office/store";
import { dialog } from "@/components/ui/dialog";
import type { OfficeDoc, OfficeDocKind } from "@/lib/office/types";

export function OfficeHome() {
  const router = useRouter();
  const docs = useOfficeStore((s) => s.docs);
  const todoLists = useOfficeStore((s) => s.todoLists);
  const createSpreadsheet = useOfficeStore((s) => s.createSpreadsheet);
  const createSpreadsheetFromCells = useOfficeStore(
    (s) => s.createSpreadsheetFromCells
  );
  const createDocument = useOfficeStore((s) => s.createDocument);
  const createPdf = useOfficeStore((s) => s.createPdf);
  const createFile = useOfficeStore((s) => s.createFile);
  const renameDoc = useOfficeStore((s) => s.renameDoc);
  const deleteDoc = useOfficeStore((s) => s.deleteDoc);
  const createTodoList = useOfficeStore((s) => s.createTodoList);

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<OfficeDocKind | "all">("all");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const mounted = useOfficeStore((s) => s.hydrated);

  const allDocs = React.useMemo(() => listDocs(docs), [docs]);
  const todoListArr = React.useMemo(() => listTodoLists(todoLists), [todoLists]);

  const visible = React.useMemo(() => {
    let out = allDocs;
    if (filter !== "all") out = out.filter((d) => d.kind === filter);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((d) => d.name.toLowerCase().includes(q));
    return out;
  }, [allDocs, filter, query]);

  function handleNewSpreadsheet() {
    const id = createSpreadsheet();
    router.push(`/office/spreadsheet/${id}`);
  }

  function handleNewDocument() {
    const id = createDocument();
    router.push(`/office/document/${id}`);
  }

  function handleOpenFile() {
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Reset the input early so the same file can be re-picked after an error.
    e.target.value = "";
    if (!f) return;

    const nameLower = f.name.toLowerCase();
    const ext =
      nameLower.includes(".") ? nameLower.split(".").pop() ?? "" : "";

    try {
      // PDF → native viewer
      if (ext === "pdf" || f.type === "application/pdf") {
        const dataUrl = await fileToDataUrl(f);
        const id = createPdf(f.name, dataUrl, f.size);
        router.push(`/office/pdf/${id}`);
        return;
      }

      // CSV / XLSX / XLS → parse to spreadsheet
      if (ext === "csv" || ext === "xlsx" || ext === "xls") {
        const buf = await f.arrayBuffer();
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array" });
        const firstSheet = wb.SheetNames[0];
        const sheet = wb.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          blankrows: true,
          defval: "",
          raw: false,
        });
        const cells: string[][] = rows.map((r) =>
          (r as unknown[]).map((v) => (v == null ? "" : String(v)))
        );
        const id = createSpreadsheetFromCells(stripExt(f.name), cells);
        router.push(`/office/spreadsheet/${id}`);
        return;
      }

      // DOCX → convert to HTML, open in doc editor
      if (ext === "docx") {
        const buf = await f.arrayBuffer();
        const mammoth = await import("mammoth");
        const { value: html } = await mammoth.convertToHtml({
          arrayBuffer: buf,
        });
        const id = createDocument(stripExt(f.name), html || "<p></p>");
        router.push(`/office/document/${id}`);
        return;
      }

      // Plaintext / markdown → open as document
      if (ext === "txt" || ext === "md" || f.type === "text/plain") {
        const text = await f.text();
        const esc = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const html = `<pre>${esc}</pre>`;
        const id = createDocument(stripExt(f.name), html);
        router.push(`/office/document/${id}`);
        return;
      }

      // Everything else → generic file viewer (images, .doc, zips, etc).
      const dataUrl = await fileToDataUrl(f);
      const id = createFile(
        f.name,
        dataUrl,
        f.size,
        f.type || "",
        ext
      );
      router.push(`/office/file/${id}`);
    } catch (err) {
      console.error("[office] failed to open file", err);
      void dialog.alert({
        title: "Couldn't open file",
        body: `${f.name}: ${(err as Error).message}`,
      });
    }
  }

  function stripExt(name: string): string {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
  }

  async function handleNewTodoList() {
    const name = await dialog.prompt({
      title: "New to-do list",
      defaultValue: "My tasks",
      placeholder: "List name",
      confirmLabel: "Create",
    });
    if (!name) return;
    const id = createTodoList(name.trim() || "My tasks");
    router.push(`/office/todo?list=${id}`);
  }

  async function handleRename(doc: OfficeDoc) {
    const next = await dialog.prompt({
      title: "Rename",
      defaultValue: doc.name,
      confirmLabel: "Rename",
    });
    if (!next || !next.trim()) return;
    renameDoc(doc.id, next.trim());
  }

  async function handleDelete(doc: OfficeDoc) {
    const ok = await dialog.confirm({
      title: "Delete",
      body: `Delete "${doc.name}"? This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    deleteDoc(doc.id);
  }

  // Hydration guard: avoid rendering localStorage-based lists on SSR.
  const docCount = mounted ? allDocs.length : 0;
  const todoCount = mounted ? todoListArr.length : 0;

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-8 animate-fade-in-up">
      <PageHeader
        eyebrow="Workspace"
        title="Office"
        description="Create spreadsheets, documents, open any file (PDF, Excel, Word, CSV, image…), and track to-dos — all in one place."
        actions={
          <Badge tone="brand" dot>
            {docCount} files · {todoCount} lists
          </Badge>
        }
      />

      {/* Quick actions — colorful tiles */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <QuickTile
          tone="olive"
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="New spreadsheet"
          desc="Rows, columns & formulas"
          onClick={handleNewSpreadsheet}
        />
        <QuickTile
          tone="amber"
          icon={<FileText className="h-5 w-5" />}
          title="New document"
          desc="Rich text editor"
          onClick={handleNewDocument}
        />
        <QuickTile
          tone="lavender"
          icon={<FileUp className="h-5 w-5" />}
          title="Open"
          desc="PDF, Excel, Word, CSV, image…"
          onClick={handleOpenFile}
        />
        <QuickTile
          tone="cream"
          icon={<CheckSquare className="h-5 w-5" />}
          title="To-Do lists"
          desc="Tasks & priorities"
          onClick={handleNewTodoList}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileSelected}
      />

      {/* Search / filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents…"
            className="h-10 w-full rounded-xl bg-card pl-9 pr-3 text-[13.5px] shadow-xs ring-1 ring-inset ring-border transition-all hover:ring-border focus:ring-2 focus:ring-brand/40 focus:outline-none"
          />
        </div>
        <FilterPill
          label="All"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterPill
          label="Spreadsheets"
          active={filter === "spreadsheet"}
          onClick={() => setFilter("spreadsheet")}
        />
        <FilterPill
          label="Documents"
          active={filter === "document"}
          onClick={() => setFilter("document")}
        />
        <FilterPill
          label="PDFs"
          active={filter === "pdf"}
          onClick={() => setFilter("pdf")}
        />
        <FilterPill
          label="Files"
          active={filter === "file"}
          onClick={() => setFilter("file")}
        />
      </div>

      {/* Docs grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {mounted && visible.length === 0 && (
          <Card className="col-span-full py-16 text-center">
            <p className="text-[13.5px] text-muted-foreground">
              No files yet. Create your first one above.
            </p>
          </Card>
        )}
        {mounted &&
          visible.map((d) => (
            <DocCard
              key={d.id}
              doc={d}
              onRename={() => handleRename(d)}
              onDelete={() => handleDelete(d)}
            />
          ))}
      </div>

      {/* To-Do lists section */}
      <div className="mt-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
            To-Do lists
          </h2>
          <Button variant="outline" size="sm" onClick={handleNewTodoList}>
            <Plus className="h-3.5 w-3.5" />
            New list
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mounted && todoListArr.length === 0 && (
            <Card className="col-span-full py-12 text-center">
              <p className="text-[13.5px] text-muted-foreground">
                No lists yet. Click &quot;New list&quot; to create one.
              </p>
            </Card>
          )}
          {mounted &&
            todoListArr.map((list) => {
              const open = list.items.filter((i) => !i.done).length;
              const total = list.items.length;
              return (
                <Link
                  key={list.id}
                  href={`/office/todo?list=${list.id}`}
                  className="press block transform-gpu"
                >
                  <Card
                    interactive
                    className="flex h-full flex-col gap-3 p-5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: list.color }}
                      >
                        <CheckSquare className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-foreground">
                          {list.name}
                        </div>
                        <div className="text-[11.5px] text-muted-foreground">
                          {open} open · {total} total
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[#b3b788]"
                        style={{
                          width:
                            total === 0
                              ? "0%"
                              : `${Math.round(
                                  ((total - open) / total) * 100
                                )}%`,
                        }}
                      />
                    </div>
                  </Card>
                </Link>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function QuickTile({
  tone,
  icon,
  title,
  desc,
  onClick,
}: {
  tone: "olive" | "amber" | "lavender" | "cream";
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  const chip =
    tone === "olive"
      ? "bg-white/25 text-[#2a2a20]"
      : tone === "amber"
        ? "bg-white/35 text-[#3a2e14]"
        : tone === "lavender"
          ? "bg-white/35 text-[#1f1b3a]"
          : "bg-brand-soft text-[hsl(90_35%_28%)]";

  const titleColor =
    tone === "olive"
      ? "text-[#1f1f18]"
      : tone === "amber"
        ? "text-[#2a2010]"
        : tone === "lavender"
          ? "text-[#17142b]"
          : "text-foreground";

  const descColor =
    tone === "olive"
      ? "text-[#2a2a20]/70"
      : tone === "amber"
        ? "text-[#3a2e14]/70"
        : tone === "lavender"
          ? "text-[#1f1b3a]/70"
          : "text-muted-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className="press block w-full text-left transform-gpu"
    >
      <Card interactive tone={tone}>
        <div className="flex items-start gap-3 p-5">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", chip)}>
            {icon}
          </div>
          <div className="flex flex-1 flex-col gap-0.5 pt-0.5">
            <span className={cn("text-[14px] font-semibold", titleColor)}>
              {title}
            </span>
            <span className={cn("text-[11.5px]", descColor)}>{desc}</span>
          </div>
          <Plus className={cn("h-4 w-4 opacity-60", titleColor)} />
        </div>
      </Card>
    </button>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press h-9 rounded-full px-4 text-[12.5px] font-medium transition-all transform-gpu ring-1 ring-inset",
        active
          ? "bg-primary text-primary-foreground ring-transparent shadow-sm"
          : "bg-card text-muted-foreground ring-border hover:text-foreground hover:ring-border"
      )}
    >
      {label}
    </button>
  );
}

function DocCard({
  doc,
  onRename,
  onDelete,
}: {
  doc: OfficeDoc;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [menuOpen]);

  const meta = docMeta(doc);

  return (
    <div className="relative">
      <Link href={meta.href} className="press block transform-gpu">
        <Card interactive className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                meta.iconBg
              )}
            >
              {meta.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-foreground">
                {doc.name}
              </div>
              <div className="text-[11.5px] text-muted-foreground">
                {meta.label} · {formatDate(doc.updatedAt)}
              </div>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-mono opacity-70">{doc.id.slice(0, 6)}</span>
            <span className="opacity-70">{meta.sub}</span>
          </div>
        </Card>
      </Link>
      <div ref={menuRef} className="absolute right-3 top-3 z-10">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="press flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground ring-1 ring-inset ring-transparent hover:bg-accent hover:text-foreground hover:ring-border"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 min-w-[160px] rounded-xl bg-popover p-1 shadow-pop ring-1 ring-black/5 animate-scale-in">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRename();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-foreground hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-destructive hover:bg-destructive-soft"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function docMeta(doc: OfficeDoc): {
  href: string;
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  sub: string;
} {
  if (doc.kind === "spreadsheet") {
    return {
      href: `/office/spreadsheet/${doc.id}`,
      label: "Spreadsheet",
      icon: <FileSpreadsheet className="h-4 w-4 text-[hsl(90_35%_28%)]" />,
      iconBg: "bg-brand-soft",
      sub: `${doc.rows}×${doc.cols}`,
    };
  }
  if (doc.kind === "document") {
    const length = doc.html.replace(/<[^>]+>/g, "").trim().length;
    return {
      href: `/office/document/${doc.id}`,
      label: "Document",
      icon: <FileText className="h-4 w-4 text-[hsl(30_60%_38%)]" />,
      iconBg: "bg-warning-soft",
      sub: `${length} chars`,
    };
  }
  if (doc.kind === "pdf") {
    return {
      href: `/office/pdf/${doc.id}`,
      label: "PDF",
      icon: <FileUp className="h-4 w-4 text-[hsl(260_40%_35%)]" />,
      iconBg: "bg-[#ece8fa]",
      sub: formatBytes(doc.size),
    };
  }
  // kind === "file"
  return {
    href: `/office/file/${doc.id}`,
    label: (doc.extension || "File").toUpperCase(),
    icon: <FileIcon className="h-4 w-4 text-[hsl(220_10%_35%)]" />,
    iconBg: "bg-muted",
    sub: formatBytes(doc.size),
  };
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(2)} MB`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
