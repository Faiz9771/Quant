"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Link as Link_ } from "@tiptap/extension-link";
import { TextAlign } from "@tiptap/extension-text-align";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Printer,
  Quote,
  Redo2,
  Save,
  Strikethrough,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOfficeStore } from "@/lib/office/store";
import { dialog } from "@/components/ui/dialog";

interface Props {
  docId: string;
}

export function DocumentEditor({ docId }: Props) {
  const router = useRouter();
  const doc = useOfficeStore((s) => s.docs[docId]);
  const updateDocument = useOfficeStore((s) => s.updateDocument);
  const renameDoc = useOfficeStore((s) => s.renameDoc);
  const deleteDoc = useOfficeStore((s) => s.deleteDoc);
  const hydrated = useOfficeStore((s) => s.hydrated);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const saveTimer = React.useRef<number | null>(null);

  const html = doc && doc.kind === "document" ? doc.html : "";

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Underline,
        Link_.configure({ openOnClick: false, autolink: true }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
        Highlight,
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({
          placeholder: "Start writing…",
        }),
      ],
      content: html || "<p></p>",
      editorProps: {
        attributes: {
          class:
            "prose-document tiptap min-h-[60vh] focus:outline-none px-12 py-10",
        },
      },
      onUpdate: ({ editor }) => {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          updateDocument(docId, editor.getHTML());
          setSavedAt(Date.now());
        }, 400);
      },
    },
    [docId]
  );

  // Keep editor in sync when switching docs (unlikely with dynamic routes, but safe).
  React.useEffect(() => {
    if (!editor) return;
    if (!doc || doc.kind !== "document") return;
    if (editor.getHTML() !== doc.html) {
      editor.commands.setContent(doc.html || "<p></p>", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, editor]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-[1440px] px-8 py-8">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!doc || doc.kind !== "document") {
    return (
      <div className="mx-auto max-w-[1440px] px-8 py-12 text-center">
        <h2 className="mb-2 text-xl font-semibold">Document not found</h2>
        <Link href="/office">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Office
          </Button>
        </Link>
      </div>
    );
  }

  async function onRename() {
    const next = await dialog.prompt({
      title: "Rename document",
      defaultValue: doc!.name,
      confirmLabel: "Rename",
    });
    if (next && next.trim()) renameDoc(docId, next.trim());
  }

  async function onDelete() {
    const ok = await dialog.confirm({
      title: "Delete document",
      body: `Delete "${doc!.name}"? This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    deleteDoc(docId);
    router.push("/office");
  }

  async function addLink() {
    const url = await dialog.prompt({
      title: "Insert link",
      placeholder: "https://",
      confirmLabel: "Insert",
    });
    if (!url || !editor) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  function insertTable() {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  function onPrint() {
    window.print();
  }

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
            {doc.name}
          </button>
          {savedAt && (
            <Badge tone="success" className="text-[10px]">
              <Save className="mr-1 h-2.5 w-2.5" />
              Saved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrint}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      {editor && <Toolbar editor={editor} onLink={addLink} onTable={insertTable} />}

      {/* Editor */}
      <div className="mt-4 flex justify-center">
        <div className="w-full max-w-[880px] rounded-2xl bg-white shadow-md ring-1 ring-black/[0.04]">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Prose styles (scoped) */}
      <style jsx global>{`
        .tiptap h1 {
          font-size: 2rem;
          line-height: 1.15;
          margin: 1.25em 0 0.5em;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .tiptap h2 {
          font-size: 1.5rem;
          line-height: 1.2;
          margin: 1em 0 0.4em;
          font-weight: 700;
          letter-spacing: -0.015em;
        }
        .tiptap h3 {
          font-size: 1.2rem;
          line-height: 1.25;
          margin: 0.9em 0 0.3em;
          font-weight: 600;
        }
        .tiptap p {
          line-height: 1.7;
          margin: 0.6em 0;
          font-size: 15px;
        }
        .tiptap ul,
        .tiptap ol {
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .tiptap ul li {
          list-style-type: disc;
          margin: 0.2em 0;
        }
        .tiptap ol li {
          list-style-type: decimal;
          margin: 0.2em 0;
        }
        .tiptap blockquote {
          border-left: 3px solid hsl(var(--brand));
          padding-left: 1em;
          margin: 1em 0;
          color: hsl(var(--muted-foreground));
          font-style: italic;
        }
        .tiptap code {
          background: hsl(var(--muted));
          padding: 0.15em 0.35em;
          border-radius: 4px;
          font-size: 0.9em;
        }
        .tiptap pre {
          background: #1a1b26;
          color: #c0caf5;
          padding: 1em 1.25em;
          border-radius: 12px;
          overflow-x: auto;
          margin: 1em 0;
        }
        .tiptap pre code {
          background: transparent;
          color: inherit;
          padding: 0;
        }
        .tiptap a {
          color: hsl(var(--brand));
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .tiptap mark {
          background: #fce79a;
          padding: 0.05em 0.15em;
          border-radius: 3px;
        }
        .tiptap table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }
        .tiptap table td,
        .tiptap table th {
          border: 1px solid hsl(var(--border));
          padding: 0.5em 0.75em;
          vertical-align: top;
        }
        .tiptap table th {
          background: hsl(var(--muted));
          font-weight: 600;
        }
        .tiptap ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0.25em;
        }
        .tiptap ul[data-type="taskList"] li {
          display: flex;
          gap: 0.5em;
          align-items: flex-start;
        }
        .tiptap ul[data-type="taskList"] li > label {
          margin-top: 0.35em;
        }
        .tiptap ul[data-type="taskList"] input[type="checkbox"] {
          accent-color: hsl(var(--brand));
        }
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function Toolbar({
  editor,
  onLink,
  onTable,
}: {
  editor: Editor;
  onLink: () => void;
  onTable: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-card p-1.5 shadow-xs ring-1 ring-inset ring-border">
      <ToolGroup>
        <ToolBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (⌘B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (⌘I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (⌘U)"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="Highlight"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </ToolBtn>
      </ToolGroup>
      <Sep />
      <ToolGroup>
        <ToolBtn
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code block"
        >
          <Code className="h-3.5 w-3.5" />
        </ToolBtn>
      </ToolGroup>
      <Sep />
      <ToolGroup>
        <ToolBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="Task list"
        >
          <CheckSquare className="h-3.5 w-3.5" />
        </ToolBtn>
      </ToolGroup>
      <Sep />
      <ToolGroup>
        <ToolBtn
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align left"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align center"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align right"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolBtn>
      </ToolGroup>
      <Sep />
      <ToolGroup>
        <ToolBtn onClick={onLink} active={editor.isActive("link")} title="Link">
          <Link2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={onTable} title="Insert 3×3 table">
          <Table2 className="h-3.5 w-3.5" />
        </ToolBtn>
      </ToolGroup>
      <Sep />
      <ToolGroup>
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo2 className="h-3.5 w-3.5" />
        </ToolBtn>
      </ToolGroup>
    </div>
  );
}

function ToolGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Sep() {
  return <span className="mx-1 h-6 w-px bg-border" />;
}

function ToolBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "press flex h-8 w-8 items-center justify-center rounded-lg transition-colors transform-gpu",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
