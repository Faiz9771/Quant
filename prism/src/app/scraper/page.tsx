import { ScraperConsole } from "@/components/scraper-console";
import { NavBar } from "@/components/nav-bar";

export const dynamic = "force-dynamic";

export default function ScraperPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="ratings" />
      <div className="pl-[260px]">
        <ScraperConsole />
      </div>
    </main>
  );
}
