"use client";

import * as React from "react";
import { useOfficeStore } from "@/lib/office/store";

/**
 * Runs once on mount to pull all Office docs + todo lists from the server
 * into the Zustand store. Safe to mount in multiple places — `hydrate` is
 * idempotent (guarded by `hydrated` / `hydrating` flags in the store).
 */
export function OfficeHydrator() {
  const hydrate = useOfficeStore((s) => s.hydrate);
  React.useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return null;
}
