import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#000000",
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
  const adClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "ca-pub-1116866075179199";

  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
        <Script id="sw-register" strategy="afterInteractive">
            {`
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {},
                    function(err) { console.error('SW registration failed: ', err); }
                  );
                });
              }
            `}
        </Script>
      </head>
      <body className="h-full bg-black text-white selection:bg-cyan-500/30">
        <main className="h-full">{children}</main>
      </body>
    </html>
  );
}
