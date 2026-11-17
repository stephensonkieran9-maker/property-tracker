import type { MetadataRoute } from "next";

// Lets the board be added to a phone's home screen and open like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Keapr Board",
    short_name: "Keapr",
    description: "How Keapr is doing: occupancy, revenue, inbox and targets.",
    start_url: "/pulse",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
