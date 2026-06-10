import { NavBar } from "@/components/nav-bar";
import { OfficeHome } from "@/components/office/office-home";

export const dynamic = "force-dynamic";

export default function OfficePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="office" />
      <div className="pl-[260px]">
        <OfficeHome />
      </div>
    </main>
  );
}
