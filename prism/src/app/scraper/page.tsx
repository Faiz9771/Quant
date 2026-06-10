import { ScraperConsole } from "@/components/scraper-console";
import { NavBar } from "@/components/nav-bar";

export const dynamic = "force-dynamic";

export default function ScraperPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="ratings" />
      <div className="pl-0 pt-14 lg:pl-[260px] lg:pt-0">
        <ScraperConsole />
      </div>
    </main>
  );
}
