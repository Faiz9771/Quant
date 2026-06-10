import { OfficeHydrator } from "@/components/office/office-hydrator";

export default function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <OfficeHydrator />
      {children}
    </>
  );
}
