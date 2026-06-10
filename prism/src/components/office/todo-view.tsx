"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  Flag,
  GripVertical,
  Pencil,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listTodoLists, useOfficeStore } from "@/lib/office/store";
import { dialog } from "@/components/ui/dialog";
import type { TodoItem, TodoPriority } from "@/lib/office/types";

const COLORS = [
  "#b3b788", // olive
  "#efd184", // amber
  "#b3a9e6", // lavender
  "#e59292", // coral
  "#8fc9c3", // teal
  "#d4a374", // tan
];

export function TodoView() {
  const router = useRouter();
  const sp = useSearchParams();
  const listParam = sp.get("list") ?? "";

  const todoLists = useOfficeStore((s) => s.todoLists);
  const createTodoList = useOfficeStore((s) => s.createTodoList);
  const renameTodoList = useOfficeStore((s) => s.renameTodoList);
  const deleteTodoList = useOfficeStore((s) => s.deleteTodoList);
  const addTodo = useOfficeStore((s) => s.addTodo);
  const updateTodo = useOfficeStore((s) => s.updateTodo);
  const toggleTodo = useOfficeStore((s) => s.toggleTodo);
  const deleteTodo = useOfficeStore((s) => s.deleteTodo);
  const reorderTodos = useOfficeStore((s) => s.reorderTodos);

  const hydrated = useOfficeStore((s) => s.hydrated);
  const [newTitle, setNewTitle] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "open" | "done">("all");
  const [priority, setPriority] = React.useState<TodoPriority>("normal");
  const [dueDate, setDueDate] = React.useState("");
  const [tagsDraft, setTagsDraft] = React.useState("");

  const allLists = React.useMemo(() => listTodoLists(todoLists), [todoLists]);

  // Auto-select first list if none provided.
  React.useEffect(() => {
    if (!hydrated) return;
    if (!listParam && allLists.length > 0) {
      router.replace(`/office/todo?list=${allLists[0].id}`);
    }
  }, [hydrated, listParam, allLists, router]);

  const activeList = listParam ? todoLists[listParam] : undefined;

  function handleAdd(e?: React.FormEvent) {
    e?.preventDefault();
    if (!activeList) return;
    const title = newTitle.trim();
    if (!title) return;
    addTodo(activeList.id, title, {
      priority,
      dueDate: dueDate || undefined,
      tags: tagsDraft
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setNewTitle("");
    setDueDate("");
    setTagsDraft("");
    setPriority("normal");
  }

  async function handleNewList() {
    const name = await dialog.prompt({
      title: "New to-do list",
      defaultValue: "My tasks",
      placeholder: "List name",
      confirmLabel: "Create",
    });
    if (!name || !name.trim()) return;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const id = createTodoList(name.trim(), color);
    router.push(`/office/todo?list=${id}`);
  }

  async function handleRenameList() {
    if (!activeList) return;
    const next = await dialog.prompt({
      title: "Rename list",
      defaultValue: activeList.name,
      confirmLabel: "Rename",
    });
    if (next && next.trim()) renameTodoList(activeList.id, next.trim());
  }

  async function handleDeleteList() {
    if (!activeList) return;
    const ok = await dialog.confirm({
      title: "Delete list",
      body: `Delete list "${activeList.name}" and all its items? This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    deleteTodoList(activeList.id);
    router.push("/office/todo");
  }

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-[1440px] px-8 py-8">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 animate-fade-in-up">
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/office">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          </Link>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">To-Do</h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleNewList}>
          <Plus className="h-3.5 w-3.5" />
          New list
        </Button>
      </div>

      {allLists.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="mb-4 text-[13.5px] text-muted-foreground">
            No lists yet. Create your first one.
          </p>
          <div className="flex justify-center">
            <Button variant="brand" size="md" onClick={handleNewList}>
              <Plus className="h-4 w-4" />
              Create list
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr]">
          {/* Sidebar — lists */}
          <aside className="flex flex-col gap-2">
            {allLists.map((l) => {
              const isActive = activeList?.id === l.id;
              const open = l.items.filter((i) => !i.done).length;
              return (
                <button
                  key={l.id}
                  onClick={() => router.push(`/office/todo?list=${l.id}`)}
                  className={cn(
                    "press group flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left transition-colors transform-gpu ring-1 ring-inset",
                    isActive
                      ? "bg-card ring-border shadow-xs"
                      : "bg-transparent ring-transparent hover:bg-accent/60"
                  )}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: l.color }}
                    />
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {l.name}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold",
                      open > 0 ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {open}
                  </span>
                </button>
              );
            })}
          </aside>

          {/* Main — items */}
          <section className="flex flex-col gap-4">
            {activeList ? (
              <>
                {/* List header */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-5 shadow-xs ring-1 ring-inset ring-border">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ backgroundColor: activeList.color }}
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-white" />
                    </span>
                    <div>
                      <button
                        onClick={handleRenameList}
                        className="press rounded-md px-1 text-[17px] font-semibold tracking-[-0.01em] hover:bg-accent"
                      >
                        {activeList.name}
                      </button>
                      <div className="text-[11.5px] text-muted-foreground">
                        {activeList.items.filter((i) => !i.done).length} open ·{" "}
                        {activeList.items.length} total
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-xl bg-muted p-0.5 ring-1 ring-inset ring-border">
                    <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
                      All
                    </FilterTab>
                    <FilterTab active={filter === "open"} onClick={() => setFilter("open")}>
                      Open
                    </FilterTab>
                    <FilterTab active={filter === "done"} onClick={() => setFilter("done")}>
                      Done
                    </FilterTab>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleDeleteList}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete list
                  </Button>
                </div>

                {/* Add form */}
                <form
                  onSubmit={handleAdd}
                  className="flex flex-wrap items-center gap-2 rounded-2xl bg-card p-3 shadow-xs ring-1 ring-inset ring-border"
                >
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Add a task…"
                    className="h-10 min-w-[180px] flex-1 rounded-xl bg-muted/60 px-3.5 text-[13.5px] text-foreground placeholder:text-muted-foreground focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
                  />
                  <PrioritySelect value={priority} onChange={setPriority} />
                  <label className="flex h-10 items-center gap-2 rounded-xl bg-muted/60 px-3 text-[12.5px] text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="bg-transparent text-[12.5px] text-foreground focus:outline-none"
                    />
                  </label>
                  <input
                    type="text"
                    value={tagsDraft}
                    onChange={(e) => setTagsDraft(e.target.value)}
                    placeholder="tags (comma)"
                    className="h-10 w-[140px] rounded-xl bg-muted/60 px-3 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-brand/40"
                  />
                  <Button type="submit" variant="brand" size="md">
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </form>

                {/* Items */}
                <div className="flex flex-col gap-2">
                  {activeList.items
                    .filter((i) =>
                      filter === "all" ? true : filter === "open" ? !i.done : i.done
                    )
                    .map((item, idx, arr) => (
                      <TodoRow
                        key={item.id}
                        item={item}
                        onToggle={() => toggleTodo(activeList.id, item.id)}
                        onDelete={() => deleteTodo(activeList.id, item.id)}
                        onUpdate={(patch) => updateTodo(activeList.id, item.id, patch)}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < arr.length - 1}
                        onMoveUp={() => {
                          const ids = activeList.items.map((i) => i.id);
                          const i = ids.indexOf(item.id);
                          if (i <= 0) return;
                          [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                          reorderTodos(activeList.id, ids);
                        }}
                        onMoveDown={() => {
                          const ids = activeList.items.map((i) => i.id);
                          const i = ids.indexOf(item.id);
                          if (i < 0 || i >= ids.length - 1) return;
                          [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                          reorderTodos(activeList.id, ids);
                        }}
                      />
                    ))}
                  {activeList.items.length === 0 && (
                    <Card className="py-12 text-center">
                      <p className="text-[13.5px] text-muted-foreground">
                        No tasks yet. Add one above.
                      </p>
                    </Card>
                  )}
                </div>
              </>
            ) : (
              <Card className="py-16 text-center">
                <p className="text-[13.5px] text-muted-foreground">
                  Select a list to view its tasks.
                </p>
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function FilterTab({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-lg px-3 text-[12px] font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function PrioritySelect({
  value,
  onChange,
}: {
  value: TodoPriority;
  onChange: (v: TodoPriority) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const colors: Record<TodoPriority, string> = {
    low: "text-muted-foreground",
    normal: "text-[hsl(90_35%_28%)]",
    high: "text-[hsl(0_65%_42%)]",
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="press flex h-10 items-center gap-2 rounded-xl bg-muted/60 px-3 text-[12.5px] transform-gpu hover:bg-accent"
      >
        <Flag className={cn("h-3.5 w-3.5", colors[value])} />
        <span className="capitalize">{value}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 min-w-[140px] rounded-xl bg-popover p-1 shadow-pop ring-1 ring-black/5">
          {(["low", "normal", "high"] as TodoPriority[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] capitalize hover:bg-accent",
                value === p && "bg-accent"
              )}
            >
              <Flag className={cn("h-3.5 w-3.5", colors[p])} />
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TodoRow({
  item,
  onToggle,
  onDelete,
  onUpdate,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  item: TodoItem;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<TodoItem>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [fullEdit, setFullEdit] = React.useState(false);
  const [draft, setDraft] = React.useState(item.title);
  const [expanded, setExpanded] = React.useState(false);

  // Full-edit drafts
  const [fTitle, setFTitle] = React.useState(item.title);
  const [fPriority, setFPriority] = React.useState<TodoPriority>(item.priority);
  const [fDueDate, setFDueDate] = React.useState(item.dueDate ?? "");
  const [fTags, setFTags] = React.useState((item.tags ?? []).join(", "));
  const [fNotes, setFNotes] = React.useState(item.notes ?? "");

  React.useEffect(() => {
    setDraft(item.title);
  }, [item.title]);

  function openFullEdit() {
    setFTitle(item.title);
    setFPriority(item.priority);
    setFDueDate(item.dueDate ?? "");
    setFTags((item.tags ?? []).join(", "));
    setFNotes(item.notes ?? "");
    setFullEdit(true);
    setEditing(false);
  }

  function commitFullEdit() {
    const title = fTitle.trim();
    if (!title) return;
    onUpdate({
      title,
      priority: fPriority,
      dueDate: fDueDate || undefined,
      tags: fTags
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      notes: fNotes.trim() || undefined,
    });
    setFullEdit(false);
  }

  function commit() {
    const t = draft.trim();
    if (t && t !== item.title) onUpdate({ title: t });
    setEditing(false);
  }

  const priorityColor: Record<TodoPriority, string> = {
    low: "bg-muted text-muted-foreground",
    normal: "bg-brand-soft text-[hsl(90_35%_28%)]",
    high: "bg-destructive-soft text-[hsl(0_65%_42%)]",
  };

  const overdue =
    item.dueDate && !item.done && new Date(item.dueDate).getTime() < startOfDay(Date.now());

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-2xl bg-card p-4 shadow-xs ring-1 ring-inset ring-border transition-colors",
        item.done && "opacity-60"
      )}
    >
      {/* Drag handle (move up/down controls) */}
      <div className="mt-1 flex flex-col items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          disabled={!canMoveUp}
          onClick={onMoveUp}
          className="press h-5 w-5 rounded text-[10px] text-muted-foreground hover:bg-accent disabled:opacity-30"
          title="Move up"
        >
          ↑
        </button>
        <GripVertical className="h-3 w-3 text-muted-foreground/40" />
        <button
          type="button"
          disabled={!canMoveDown}
          onClick={onMoveDown}
          className="press h-5 w-5 rounded text-[10px] text-muted-foreground hover:bg-accent disabled:opacity-30"
          title="Move down"
        >
          ↓
        </button>
      </div>

      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "press mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition-all transform-gpu",
          item.done
            ? "bg-[#b3b788] ring-[#6f7550] text-white"
            : "bg-card ring-border hover:ring-[#b3b788]"
        )}
      >
        {item.done && <Check className="h-3 w-3" strokeWidth={3.5} />}
      </button>

      {/* Main */}
      <div className="min-w-0 flex-1">
        {fullEdit ? (
          <div className="flex flex-col gap-2.5">
            <input
              autoFocus
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitFullEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setFullEdit(false);
                }
              }}
              placeholder="Task title"
              className="h-9 w-full rounded-lg bg-muted px-2.5 text-[13.5px] focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
            <div className="flex flex-wrap items-center gap-2">
              <PrioritySelect value={fPriority} onChange={setFPriority} />
              <label className="flex h-9 items-center gap-2 rounded-lg bg-muted/60 px-2.5 text-[12px] text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <input
                  type="date"
                  value={fDueDate}
                  onChange={(e) => setFDueDate(e.target.value)}
                  className="bg-transparent text-[12px] text-foreground focus:outline-none"
                />
                {fDueDate && (
                  <button
                    type="button"
                    onClick={() => setFDueDate("")}
                    className="text-muted-foreground hover:text-foreground"
                    title="Clear"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </label>
              <input
                type="text"
                value={fTags}
                onChange={(e) => setFTags(e.target.value)}
                placeholder="tags (comma)"
                className="h-9 flex-1 min-w-[140px] rounded-lg bg-muted/60 px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>
            <textarea
              value={fNotes}
              onChange={(e) => setFNotes(e.target.value)}
              placeholder="Notes…"
              rows={2}
              className="w-full rounded-lg bg-muted/60 p-2.5 text-[12.5px] leading-relaxed focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
            <div className="flex items-center justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFullEdit(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="brand"
                size="sm"
                onClick={commitFullEdit}
              >
                Save
              </Button>
            </div>
          </div>
        ) : editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(item.title);
                setEditing(false);
              }
            }}
            className="w-full rounded-md bg-muted px-2 py-1 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "press rounded-md px-1 py-0.5 text-left text-[13.5px] hover:bg-accent transform-gpu",
              item.done && "line-through text-muted-foreground"
            )}
          >
            {item.title}
          </button>
        )}
        {!fullEdit && (
        <>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
              priorityColor[item.priority]
            )}
          >
            <Flag className="h-2.5 w-2.5" />
            {item.priority}
          </span>
          {item.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                overdue
                  ? "bg-destructive-soft text-[hsl(0_65%_42%)]"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Calendar className="h-2.5 w-2.5" />
              {item.dueDate}
              {overdue && " · overdue"}
            </span>
          )}
          {item.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" />
              {t}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Hide notes" : "Notes"}
          </button>
        </div>
        {expanded && (
          <textarea
            value={item.notes ?? ""}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            placeholder="Add notes…"
            rows={3}
            className="mt-2 w-full rounded-lg bg-muted/60 p-2.5 text-[12.5px] leading-relaxed focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        )}
        </>
        )}
      </div>

      {/* Action buttons */}
      {!fullEdit && (
        <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={openFullEdit}
            className="press mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-all"
            title="Delete"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Suppress unused import warning
void Badge;
