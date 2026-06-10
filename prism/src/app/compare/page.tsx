import { listComparableSnapshots } from "@/lib/data/snapshots";
import { CompareView } from "@/components/compare-view";
import { NavBar } from "@/components/nav-bar";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const snapshots = await listComparableSnapshots();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="ratings" />
      <div className="pl-0 pt-14 lg:pl-[260px] lg:pt-0">
        <CompareView snapshots={snapshots} />
      </div>
    </main>
  );
}
