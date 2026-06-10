import { NavBar } from "@/components/nav-bar";
import { SpreadsheetEditor } from "@/components/office/spreadsheet-editor";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SpreadsheetPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="office" />
      <div className="pl-[260px]">
        <SpreadsheetEditor docId={id} />
      </div>
    </main>
  );
}
