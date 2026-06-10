import { NavBar } from "@/components/nav-bar";
import { OfficeHome } from "@/components/office/office-home";

export const dynamic = "force-dynamic";

export default function OfficePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <NavBar active="office" />
      <div className="pl-0 pt-14 lg:pl-[260px] lg:pt-0">
        <OfficeHome />
      </div>
    </main>
  );
}
