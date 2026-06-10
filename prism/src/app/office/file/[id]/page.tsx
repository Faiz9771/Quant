import { NavBar } from "@/components/nav-bar";
import { FileViewer } from "@/components/office/file-viewer";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FilePage({ params }: Props) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="office" />
      <div className="pl-0 pt-14 lg:pl-[260px] lg:pt-0">
        <FileViewer docId={id} />
      </div>
    </main>
  );
}
