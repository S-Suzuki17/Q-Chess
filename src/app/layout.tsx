import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display, Cinzel } from "next/font/google";
import { ANDROID_BUILD } from '../config/appPlatform';
import { GAME_DESCRIPTION, PUBLIC_SITE_URL, gameStructuredData, serializeStructuredData } from '../config/searchMetadata';
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

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

export const viewport: Viewport = {
  themeColor: "#11100E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Q-Gambit | Hidden-identity chess",
  description: GAME_DESCRIPTION,
  metadataBase: new URL(PUBLIC_SITE_URL),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Q-Gambit | Hidden-identity chess',
    description: GAME_DESCRIPTION,
    url: '/',
    siteName: 'Q-Gambit',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'Q-Gambit | Hidden-identity chess', description: GAME_DESCRIPTION },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Q-GAMBIT",
  },
  other: ANDROID_BUILD ? {} : {
    "google-adsense-account": "ca-pub-1116866075179199",
    "google-site-verification": "imleNn5cL0XRfyC8RAkSzkIOBRi542-mPZFspkcVzY4"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${cinzel.variable} h-full antialiased overflow-x-hidden`}
    >
      <body className="h-full bg-[#11100E] text-[#E8E2D7] selection:bg-[#B39A62]/30 font-sans overflow-x-hidden">
        {!ANDROID_BUILD && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(gameStructuredData) }} />}
        <main className="h-full">{children}</main>
      </body>
    </html>
  );
}
