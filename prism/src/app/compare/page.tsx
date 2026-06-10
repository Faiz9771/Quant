import { listComparableSnapshots } from "@/lib/data/snapshots";
import { CompareView } from "@/components/compare-view";
import { NavBar } from "@/components/nav-bar";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const snapshots = await listComparableSnapshots();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="ratings" />
      <div className="pl-[260px]">
        <CompareView snapshots={snapshots} />
      </div>
    </main>
  );
}
