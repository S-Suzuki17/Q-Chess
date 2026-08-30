import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#11100E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Q-GAMBIT | Quantum Superposition Chess",
  description: "Play Quantum Chess online! Pieces are in a state of superposition. Observe, collapse, and outsmart your opponent.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Q-GAMBIT",
  },
  other: {
    "google-adsense-account": "ca-pub-1116866075179199"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID || "ca-pub-1116866075179199";

  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <head>
        {adClient && (
            <Script
                async
                src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`}
                crossOrigin="anonymous"
                strategy="afterInteractive"
            />
        )}
        <Script id="adsense-init" strategy="afterInteractive">
            {`
              (adsbygoogle = window.adsbygoogle || []).push({
                google_ad_client: "${adClient}",
                enable_page_level_ads: true,
                overlays: {bottom: true}
              });
            `}
        </Script>
      </head>
      <body className="h-full bg-[#11100E] text-[#E8E2D7] selection:bg-[#B39A62]/30 font-sans">
        <main className="h-full">{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
