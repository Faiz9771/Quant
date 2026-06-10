"use client";

import * as React from "react";
import { FileText, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ModelRecord {
  id: string;
  title: string;
  description: string;
  pdfFile: string;
  createdAt: string;
  updatedAt?: string;
}

export function ModelsSection() {
  const [models, setModels] = React.useState<ModelRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ModelRecord | null>(null);
  const [viewing, setViewing] = React.useState<ModelRecord | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/models", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setModels(j.models as ModelRecord[]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete model "${title}"?`)) return;
    const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Models
        </CardTitle>
        <Button variant="brand" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add new model
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        ) : err ? (
          <p className="py-2 text-[12px] text-destructive">{err}</p>
        ) : models.length === 0 ? (
          <p className="py-4 text-[12.5px] text-muted-foreground">
            No models yet. Click &ldquo;Add new model&rdquo; to upload a checklist PDF.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-soft">
            {models.map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-brand-soft/60 text-brand ring-1 ring-inset ring-brand/20">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-foreground">
                      {m.title}
                    </div>
                    {m.description && (
                      <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
                        {m.description}
                      </div>
                    )}
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                      Added {new Date(m.createdAt).toLocaleDateString()}
                      {m.updatedAt && (
                        <>
                          {" · Updated "}
                          {new Date(m.updatedAt).toLocaleDateString()}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setViewing(m)}
                    className="inline-flex h-7 items-center rounded-md bg-muted px-2.5 text-[11.5px] font-medium text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent"
                  >
                    Open checklist
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    title="Edit"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id, m.title)}
                    title="Delete"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {addOpen && (
        <ModelDialog
          mode="add"
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}

      {editing && (
        <ModelDialog
          mode="edit"
          model={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {viewing && (
        <ViewChecklistDialog
          model={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </Card>
  );
}

function ViewChecklistDialog({
  model,
  onClose,
}: {
  model: ModelRecord;
  onClose: () => void;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-6"
      onClick={onClose}
    >
      <div
        className="relative flex h-[88vh] w-[960px] max-w-full flex-col overflow-hidden rounded-2xl bg-popover shadow-pop ring-1 ring-black/[0.06] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-soft px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-semibold tracking-[-0.01em]">
                {model.title}
              </h2>
              {model.description && (
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {model.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <a
              href={`/api/models/${model.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center whitespace-nowrap rounded-md bg-muted px-2.5 text-[11.5px] font-medium text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent"
            >
              Open in new tab
            </a>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <iframe
          src={`/api/models/${model.id}/pdf#toolbar=1&navpanes=0`}
          title={model.title}
          className="flex-1 w-full bg-muted"
        />
      </div>
    </div>
  );
}

function ModelDialog({
  mode,
  model,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  model?: ModelRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState(model?.title ?? "");
  const [description, setDescription] = React.useState(
    model?.description ?? ""
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const isEdit = mode === "edit";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    if (!isEdit && !file) {
      setErr("Please select a PDF checklist.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("description", description.trim());
      if (file) fd.append("pdf", file);

      const url = isEdit ? `/api/models/${model!.id}` : "/api/models";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-[460px] max-w-[92vw] rounded-2xl bg-popover p-5 shadow-pop ring-1 ring-black/[0.06] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
            {isEdit ? "Edit model" : "Add new model"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Growth breakout checklist"
              className="h-9 rounded-md bg-muted/60 px-3 text-[13px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this model check for? When should it be used?"
              rows={3}
              className="resize-none rounded-md bg-muted/60 px-3 py-2 text-[13px] leading-snug text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Checklist (PDF)
              {isEdit && (
                <span className="ml-1 normal-case text-[10px] tracking-normal text-muted-foreground/80">
                  — leave empty to keep the current file
                </span>
              )}
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={cn(
                "text-[12px] text-foreground",
                "file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-foreground file:ring-1 file:ring-inset file:ring-border hover:file:bg-accent"
              )}
            />
            {file && (
              <span className="text-[11px] text-muted-foreground truncate">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>

          {err && <p className="text-[11.5px] text-destructive">{err}</p>}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button variant="brand" size="sm" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {isEdit ? "Saving…" : "Uploading…"}
                </>
              ) : (
                <>{isEdit ? "Save changes" : "Save model"}</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
