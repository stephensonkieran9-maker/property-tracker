import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Property Tracker",
  description: "Track how many properties are onboarded, and what's coming in and out.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
