import * as React from "react";
import { Database, Wrench } from "lucide-react";
import { NavBar } from "@/components/nav-bar";
import { PageHeader } from "@/components/ui/page-header";
import { OhlcvDownloader } from "@/components/library/ohlcv-downloader";
import { FiiDiiDownloader } from "@/components/library/fii-dii-downloader";
import { FiiHoldings } from "@/components/library/fii-holdings";
import { MarketConditionDownloader } from "@/components/library/market-condition-downloader";
import { ChartBuilder } from "@/components/library/chart-builder";
import { CagrCalculator } from "@/components/library/cagr-calculator";
import { ReturnsCalculator } from "@/components/library/returns-calculator";
import { FanBreakout } from "@/components/library/fan-breakout";
import { VolatilityBreakout } from "@/components/library/volatility-breakout";

export default function LibraryPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="library" />
      <div className="pl-0 pt-14 lg:pl-[260px] lg:pt-0">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-10 animate-fade-in-up">
          <PageHeader
            eyebrow="Data"
            title="Library"
            description="Datasets, lookups, and tools for market analysis."
          />

          <div className="flex flex-col gap-12">
            <Section
              icon={<Database className="h-4 w-4" />}
              eyebrow="Data sources"
              title="Downloads & lookups"
              count={4}
            >
              <OhlcvDownloader />
              <FiiDiiDownloader />
              <FiiHoldings />
              <MarketConditionDownloader />
            </Section>

            <Section
              icon={<Wrench className="h-4 w-4" />}
              eyebrow="Tools"
              title="Calculators, scanners & builders"
              count={5}
            >
              <ChartBuilder />
              <CagrCalculator />
              <ReturnsCalculator />
              <FanBreakout />
              <VolatilityBreakout />
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  count: number;
  children: React.ReactNode;
}

function Section({ icon, eyebrow, title, count, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 border-b border-border/40 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-inset ring-border/60">
            {icon}
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </span>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {title}
            </h2>
          </div>
        </div>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {count} {count === 1 ? "item" : "items"}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {React.Children.map(children, (child, i) => (
          <div key={i} className="flex">
            {child}
          </div>
        ))}
      </div>
    </section>
  );
}
