// Page shell: fonts, title, and a fixed light colour scheme (no theme switcher, on purpose).
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terrasse — plan a trip that already feels like holiday",
  description: "Tell us where you're going, who's coming and what you love. Get a day-by-day plan you can change freely.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#F6B25A",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
