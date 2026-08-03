import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";

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

export const metadata: Metadata = {
  title: "Forefront HR",
  description: "Forefront Consulting — internal HR platform",
  applicationName: "Forefront HR",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Forefront HR" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#16223c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
