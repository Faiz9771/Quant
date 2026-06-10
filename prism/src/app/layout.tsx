import type { Metadata } from "next";
import "./globals.css";
import { DialogRoot } from "@/components/ui/dialog";

export const metadata: Metadata = {
  title: "Prism — MarketSmith Ratings",
  description:
    "Nifty large/mid/small cap MarketSmith ratings dashboard. Snapshots, comparisons, live validation, and scraper control.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <DialogRoot />
      </body>
    </html>
  );
}
