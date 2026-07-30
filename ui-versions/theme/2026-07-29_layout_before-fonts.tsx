import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forefront HR",
  description: "Forefront Consulting — internal HR platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
