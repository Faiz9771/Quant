import { NavBar } from "@/components/nav-bar";
import { PdfViewer } from "@/components/office/pdf-viewer";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PdfPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="office" />
      <div className="pl-0 pt-14 lg:pl-[260px] lg:pt-0">
        <PdfViewer docId={id} />
      </div>
    </main>
  );
}
