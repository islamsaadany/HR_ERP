import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { getBrand, brandThemeCss } from "@/lib/brand";

export const dynamic = "force-dynamic";

// Display serif (headings) + refined grotesk body — self-hosted at build via next/font.
const serif = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif-next",
  display: "swap",
});
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-next",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: brand.platformName,
    description: `${brand.shortName} — internal HR platform`,
    applicationName: brand.platformName,
    // Next 15 renders `appleWebApp.capable` as the MODERN `mobile-web-app-capable` meta, not
    // the deprecated Apple-prefixed one — checked against the served HTML, 2026-08-25. Adding
    // `other: { "mobile-web-app-capable": … }` here therefore emits it twice.
    appleWebApp: { capable: true, statusBarStyle: "default", title: brand.platformName },
    icons: {
      icon: "/icons/icon-192.png?v=2",
      apple: "/icons/apple-touch-icon.png?v=2",
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await getBrand();
  // viewportFit "cover" lets the page paint into the notch/home-indicator area — which is what
  // makes `env(safe-area-inset-*)` non-zero, so the safe-area rules in globals.css can do their
  // job. Without it those insets always report 0 and the navy header sits under the clock.
  return { themeColor: brand.primaryColor, viewportFit: "cover" };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = await getBrand();
  const themeCss = brandThemeCss(brand.primaryColor, brand.accentColor);
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
