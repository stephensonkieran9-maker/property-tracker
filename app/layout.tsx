import type { Metadata } from "next";
import "./globals.css";
import "./board.css";

export const metadata: Metadata = {
  title: "Keapr · Board",
  description: "Occupancy, inbox issues, bookings, revenue and team targets — live from Hostaway.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
