"use client";

import * as React from "react";
import { AlertTriangle, Info, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type Tone = "default" | "danger";

interface BaseOpts {
  title?: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

type AlertOpts = Omit<BaseOpts, "cancelLabel">;
type ConfirmOpts = BaseOpts;
interface PromptOpts extends BaseOpts {
  defaultValue?: string;
  placeholder?: string;
  /** Optional validator — return an error message string to block submit. */
  validate?: (value: string) => string | null | undefined;
}

type Request =
  | { id: number; kind: "alert"; opts: AlertOpts; resolve: () => void }
  | {
      id: number;
      kind: "confirm";
      opts: ConfirmOpts;
      resolve: (value: boolean) => void;
    }
  | {
      id: number;
      kind: "prompt";
      opts: PromptOpts;
      resolve: (value: string | null) => void;
    };

// ────────────────────────────────────────────────────────────────────────────
// Dispatcher — module-level emitter so any component can call dialog.*
// ────────────────────────────────────────────────────────────────────────────

let nextId = 1;
type Listener = (req: Request) => void;
const listeners = new Set<Listener>();
function dispatch(req: Request) {
  listeners.forEach((l) => l(req));
}

export const dialog = {
  alert(opts: string | AlertOpts): Promise<void> {
    const o = typeof opts === "string" ? { body: opts } : opts;
    return new Promise((resolve) => {
      dispatch({ id: nextId++, kind: "alert", opts: o, resolve });
    });
  },
  confirm(opts: string | ConfirmOpts): Promise<boolean> {
    const o = typeof opts === "string" ? { body: opts } : opts;
    return new Promise((resolve) => {
      dispatch({ id: nextId++, kind: "confirm", opts: o, resolve });
    });
  },
  prompt(opts: string | PromptOpts): Promise<string | null> {
    const o = typeof opts === "string" ? { body: opts } : opts;
    return new Promise((resolve) => {
      dispatch({ id: nextId++, kind: "prompt", opts: o, resolve });
    });
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Root — mounted once at the top of the tree
// ────────────────────────────────────────────────────────────────────────────

export function DialogRoot() {
  const [current, setCurrent] = React.useState<Request | null>(null);
  const queueRef = React.useRef<Request[]>([]);

  React.useEffect(() => {
    const onRequest: Listener = (req) => {
      if (current) queueRef.current.push(req);
      else setCurrent(req);
    };
    listeners.add(onRequest);
    return () => {
      listeners.delete(onRequest);
    };
  }, [current]);

  function advance() {
    const next = queueRef.current.shift() ?? null;
    setCurrent(next);
  }

  if (!current) return null;

  return (
    <DialogShell
      key={current.id}
      request={current}
      onDone={advance}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shell — the actual visible card
// ────────────────────────────────────────────────────────────────────────────

function DialogShell({
  request,
  onDone,
}: {
  request: Request;
  onDone: () => void;
}) {
  const [value, setValue] = React.useState<string>(
    request.kind === "prompt" ? request.opts.defaultValue ?? "" : ""
  );
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { kind, opts } = request;
  const tone: Tone =
    (opts as BaseOpts).tone ?? (kind === "confirm" ? "default" : "default");
  const title =
    opts.title ??
    (kind === "alert"
      ? "Notice"
      : kind === "confirm"
        ? "Are you sure?"
        : "Enter a value");
  const body = opts.body;
  const confirmLabel =
    opts.confirmLabel ??
    (kind === "alert" ? "OK" : kind === "confirm" ? "Confirm" : "Save");
  const cancelLabel =
    kind === "alert"
      ? null
      : (opts as ConfirmOpts | PromptOpts).cancelLabel ?? "Cancel";

  // Focus + select on mount for the prompt input; OK for alert/confirm.
  const confirmBtnRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      confirmBtnRef.current?.focus();
    }
  }, [kind]);

  // Lock body scroll while dialog is open.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function finish(cancel: boolean) {
    if (request.kind === "alert") {
      request.resolve();
    } else if (request.kind === "confirm") {
      request.resolve(!cancel);
    } else {
      if (cancel) request.resolve(null);
      else {
        const v = value;
        const err = request.opts.validate?.(v);
        if (err) {
          setError(err);
          return;
        }
        request.resolve(v);
      }
    }
    onDone();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Enter" && kind !== "prompt") {
      // For prompt, Enter inside the input handles submit via form below.
      e.preventDefault();
      finish(false);
    }
  }

  // Icon badge tone
  const iconEl =
    tone === "danger" ? (
      <Trash2 className="h-4 w-4" />
    ) : kind === "alert" ? (
      <AlertTriangle className="h-4 w-4" />
    ) : (
      <Info className="h-4 w-4" />
    );
  const iconChip = cn(
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
    tone === "danger"
      ? "bg-destructive-soft text-destructive"
      : "bg-brand-soft text-[hsl(90_35%_28%)]"
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`dlg-title-${request.id}`}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in-up"
      onKeyDown={onKeyDown}
    >
      {/* Backdrop — soft warm dimming, click to cancel */}
      <button
        aria-label="Close dialog"
        onClick={() => finish(true)}
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px] transition-opacity"
      />

      {/* Card */}
      <div
        className={cn(
          "relative z-10 w-full max-w-[440px] rounded-3xl bg-card text-card-foreground shadow-pop ring-1 ring-black/[0.05]",
          "surface-gradient animate-scale-in"
        )}
      >
        <div className="flex items-start gap-3 px-6 pt-6">
          <div className={iconChip}>{iconEl}</div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div
              id={`dlg-title-${request.id}`}
              className="text-[15.5px] font-semibold tracking-[-0.01em] text-foreground"
            >
              {title}
            </div>
            {body && (
              <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {body}
              </div>
            )}
          </div>
        </div>

        {kind === "prompt" && (
          <form
            className="mt-4 px-6"
            onSubmit={(e) => {
              e.preventDefault();
              finish(false);
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder={request.opts.placeholder}
              className={cn(
                "h-10 w-full rounded-xl bg-background px-3.5 text-[13.5px] shadow-xs ring-1 ring-inset transition-all focus:outline-none",
                error
                  ? "ring-destructive focus:ring-2 focus:ring-destructive/60"
                  : "ring-border focus:ring-2 focus:ring-brand/50"
              )}
            />
            {error && (
              <div className="mt-1.5 text-[11.5px] text-destructive">
                {error}
              </div>
            )}
          </form>
        )}

        <div className="mt-5 flex items-center justify-end gap-2 px-6 pb-5">
          {cancelLabel && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => finish(true)}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            ref={confirmBtnRef}
            variant={tone === "danger" ? "danger" : "default"}
            size="sm"
            onClick={() => finish(false)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
