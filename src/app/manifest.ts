import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes Forefront HR installable as a PWA ("Add to Home Screen").
 * Next serves this at /manifest.webmanifest and links it automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Forefront HR",
    short_name: "Forefront HR",
    description: "Forefront Consulting — internal HR platform",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#16223c",
    theme_color: "#16223c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
