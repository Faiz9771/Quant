import { listSnapshots, loadLatest } from "@/lib/data/snapshots";
import { MainDashboard } from "@/components/main-dashboard";
import { NavBar } from "@/components/nav-bar";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [snapshots, dataset] = await Promise.all([
    listSnapshots(),
    loadLatest(),
  ]);

  const updatedLabel = dataset.message.includes("Updated:")
    ? "Updated: " + dataset.message.split("Updated:")[1].trim()
    : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="ratings" lastUpdated={updatedLabel} />
      <div className="pl-[260px]">
        <MainDashboard initialSnapshots={snapshots} initialDataset={dataset} />
      </div>
    </main>
  );
}
