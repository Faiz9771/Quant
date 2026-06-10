import { Suspense } from "react";
import { NavBar } from "@/components/nav-bar";
import { TodoView } from "@/components/office/todo-view";

export const dynamic = "force-dynamic";

export default function TodoPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="office" />
      <div className="pl-0 pt-14 lg:pl-[260px] lg:pt-0">
        <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
          <TodoView />
        </Suspense>
      </div>
    </main>
  );
}
