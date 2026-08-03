import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * Web app manifest — makes the app installable as a PWA ("Add to Home Screen").
 * Name + theme color follow the configured brand. Next serves this at
 * /manifest.webmanifest and links it automatically.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBrand();
  return {
    name: brand.companyName,
    short_name: brand.shortName,
    description: `${brand.shortName} — internal HR platform`,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: brand.primaryColor,
    theme_color: brand.primaryColor,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
