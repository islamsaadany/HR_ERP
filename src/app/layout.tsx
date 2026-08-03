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
    title: brand.companyName,
    description: `${brand.shortName} — internal HR platform`,
    applicationName: brand.companyName,
    appleWebApp: { capable: true, statusBarStyle: "default", title: brand.companyName },
    icons: {
      icon: "/icons/icon-192.png",
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await getBrand();
  return { themeColor: brand.primaryColor };
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
