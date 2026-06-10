import { loadLiveValidation } from "@/lib/data/live-validation";
import { LiveValidationView } from "@/components/live-validation-view";
import { ModelsSection } from "@/components/live-validation/models-section";
import { NavBar } from "@/components/nav-bar";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const dataset = await loadLiveValidation();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="models" />
      <div className="pl-0 pt-14 lg:pl-[260px] lg:pt-0">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8 animate-fade-in-up">
          <PageHeader
            eyebrow="Testing"
            title="Models"
            description="Prediction models and their ongoing validation."
          />
          <ModelsSection />
        </div>
        <LiveValidationView initialDataset={dataset} />
      </div>
    </main>
  );
}
