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

export function FileViewer({ docId }: Props) {
  const router = useRouter();
  const doc = useOfficeStore((s) => s.docs[docId]);
  const hydrated = useOfficeStore((s) => s.hydrated);
  const renameDoc = useOfficeStore((s) => s.renameDoc);
  const deleteDoc = useOfficeStore((s) => s.deleteDoc);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-8">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!doc || doc.kind !== "file") {
    return (
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-12 text-center">
        <h2 className="mb-2 text-xl font-semibold">File not found</h2>
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
      title: "Rename file",
      defaultValue: doc!.name,
      confirmLabel: "Rename",
    });
    if (next && next.trim()) renameDoc(docId, next.trim());
  }

  async function onDelete() {
    const ok = await dialog.confirm({
      title: "Delete file",
      body: `Delete "${doc!.name}"? This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    deleteDoc(docId);
    router.push("/office");
  }

  function onDownload() {
    if (doc!.kind !== "file") return;
    const a = document.createElement("a");
    a.href = doc!.dataUrl;
    a.download = doc!.name;
    a.click();
  }

  const sizeLabel = formatBytes(doc.size);
  const mime = doc.mimeType || "";
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/");
  // Text-like things the browser iframe can render.
  const isInlineDisplayable =
    isImage ||
    isVideo ||
    isAudio ||
    mime === "text/plain" ||
    mime === "text/html" ||
    mime === "text/csv" ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "text/xml";

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6 animate-fade-in-up">
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
            {(doc.extension || "file").toUpperCase()} · {sizeLabel}
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

      <div className="overflow-hidden rounded-2xl bg-[#1a1b26] shadow-md ring-1 ring-black/[0.05]">
        {isImage ? (
          <div className="flex max-h-[calc(100vh-180px)] items-center justify-center overflow-auto bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={doc.dataUrl}
              alt={doc.name}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : isVideo ? (
          <video
            src={doc.dataUrl}
            controls
            className="block h-[calc(100vh-180px)] w-full bg-black"
          />
        ) : isAudio ? (
          <div className="flex h-[200px] items-center justify-center bg-white p-6">
            <audio src={doc.dataUrl} controls className="w-full max-w-md" />
          </div>
        ) : isInlineDisplayable ? (
          <iframe
            src={doc.dataUrl}
            title={doc.name}
            className="block h-[calc(100vh-180px)] w-full border-0 bg-white"
          />
        ) : (
          <div className="flex h-[calc(100vh-180px)] flex-col items-center justify-center bg-white px-6 text-center">
            <p className="mb-2 text-[15px] font-semibold text-foreground">
              This file type can&apos;t be previewed inline
            </p>
            <p className="mb-6 max-w-md text-[13px] text-muted-foreground">
              {doc.extension
                ? `.${doc.extension} (${mime || "unknown type"})`
                : mime || "Unknown type"}{" "}
              — download to open with a native app.
            </p>
            <Button onClick={onDownload}>
              <Download className="h-3.5 w-3.5" />
              Download {doc.name}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(2)} MB`;
}
