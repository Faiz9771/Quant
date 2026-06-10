import { NavBar } from "@/components/nav-bar";
import { PageHeader } from "@/components/ui/page-header";
import { MarketConditionPill } from "@/components/dashboard/market-condition-pill";
import { MarketMoodPill } from "@/components/dashboard/market-mood-pill";
import { RecentOpenBuys } from "@/components/dashboard/recent-open-buys";
import { FiiDiiRecent } from "@/components/dashboard/fii-dii-recent";
import { FiiDiiSectors } from "@/components/dashboard/fii-dii-sectors";
import { SectorRotation } from "@/components/dashboard/sector-rotation";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="dashboard" />
      <div className="pl-0 pt-14 lg:pl-[260px] lg:pt-0">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-8 animate-fade-in-up">
          <PageHeader
            eyebrow="Overview"
            title="Dashboard"
            description="Everything at one place
            "
            actions={
              <div className="flex flex-col items-end gap-2">
                <MarketConditionPill />
                <MarketMoodPill />
              </div>
            }
          />
          <div className="mt-6 flex flex-nowrap items-start gap-6 overflow-x-auto">
            <RecentOpenBuys />
            <FiiDiiRecent />
            <SectorRotation />
          </div>
          <div className="mt-6 flex flex-nowrap items-start gap-6 overflow-x-auto">
            <FiiDiiSectors />
          </div>
        </div>
      </div>
    </main>
  );
}
