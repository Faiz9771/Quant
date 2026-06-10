"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOfficeStore } from "@/lib/office/store";
import { dialog } from "@/components/ui/dialog";

interface Props {
  docId: string;
}

export function PdfViewer({ docId }: Props) {
  const router = useRouter();
  const doc = useOfficeStore((s) => s.docs[docId]);
  const renameDoc = useOfficeStore((s) => s.renameDoc);
  const deleteDoc = useOfficeStore((s) => s.deleteDoc);
  const hydrated = useOfficeStore((s) => s.hydrated);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-8">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!doc || doc.kind !== "pdf") {
    return (
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-12 text-center">
        <h2 className="mb-2 text-xl font-semibold">PDF not found</h2>
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
      title: "Rename PDF",
      defaultValue: doc!.name,
      confirmLabel: "Rename",
    });
    if (next && next.trim()) renameDoc(docId, next.trim());
  }

  async function onDelete() {
    const ok = await dialog.confirm({
      title: "Delete PDF",
      body: `Delete "${doc!.name}"? This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    deleteDoc(docId);
    router.push("/office");
  }

  function onDownload() {
    if (doc!.kind !== "pdf") return;
    const a = document.createElement("a");
    a.href = doc!.dataUrl;
    a.download = doc!.name.endsWith(".pdf") ? doc!.name : `${doc!.name}.pdf`;
    a.click();
  }

  const sizeLabel =
    doc.size < 1024
      ? `${doc.size} B`
      : doc.size < 1_048_576
        ? `${(doc.size / 1024).toFixed(1)} KB`
        : `${(doc.size / 1_048_576).toFixed(2)} MB`;

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6 animate-fade-in-up">
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
          <Badge tone="info" className="text-[10px]">
            PDF · {sizeLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Viewer */}
      <div className="overflow-hidden rounded-2xl bg-[#1a1b26] shadow-md ring-1 ring-black/[0.05]">
        <iframe
          src={doc.dataUrl}
          title={doc.name}
          className="block h-[calc(100vh-180px)] w-full border-0 bg-white"
        />
      </div>

      <p className="mt-3 text-[11.5px] text-muted-foreground">
        Tip: use your browser&apos;s native PDF controls (zoom, search, scroll) inside the viewer above.
      </p>
    </div>
  );
}
