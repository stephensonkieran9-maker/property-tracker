import type { Metadata, Viewport } from "next";
// Fonts are bundled with the site (no wait on Google, no text jumping when they arrive).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import "./board.css";
import "./portal.css";
import Sidebar from "./components/Sidebar";

export const metadata: Metadata = {
  title: "Keapr · Board",
  description: "Occupancy, inbox issues, bookings, revenue and team targets — live from Hostaway.",
  appleWebApp: { capable: true, title: "Keapr", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="kb">
          <Sidebar />
          {children}
        </div>
      </body>
    </html>
  );
}
