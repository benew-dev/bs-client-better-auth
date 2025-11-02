// app/layout.js - Configuration mise à jour avec favicon

import { Suspense } from "react";
import dynamic from "next/dynamic";

import "@/app/globals.css";

import { GlobalProvider } from "./GlobalProvider";
import Header from "@/components/layouts/Header";

const Footer = dynamic(() => import("@/components/layouts/Footer"));
const ServiceWorkerManager = dynamic(() =>
  import("@/components/utils/ServiceWorkerManager")
);

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://bs-client-blond.vercel.app";

// Métadonnées globales pour le site avec configuration des icônes
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Buy It Now",
    template: "%s | Buy It Now",
  },
  description:
    "Boutique en ligne simplifiée (BS), Buy It Now est la solution pour acheter et vendre facilement sur Internet.",
  keywords: [
    "e-commerce",
    "shopping",
    "online store",
    "products",
    "Buy It Now",
    "BS",
    "boutique en ligne",
    "solution d'achat",
  ],
  // AJOUT DE LA CONFIGURATION DES ICÔNES
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [
      { url: "/apple-icon.png" },
      { url: "/apple-icon-180x180.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "mask-icon",
        url: "/safari-pinned-tab.svg",
      },
    ],
  },
  manifest: "/manifest.json",
  referrer: "origin-when-cross-origin",
  authors: [{ name: "Benew Team" }],
  creator: "Benew Team",
  publisher: "Benew",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    nocache: true,
    noimageindex: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    title: "Buy It Now",
    description:
      "Boutique en ligne simplifiée (BS), Buy It Now est la solution pour acheter et vendre facilement sur Internet.",
    siteName: "BS - Buy It Now",
    // AJOUT D'IMAGES POUR OPEN GRAPH
    images: [
      {
        url: `${SITE_URL}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: "Buy It Now",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Buy It Now",
    description: "Boutique en ligne simplifiée (BS), Buy It Now",
    creator: "@benew",
    site: "@benew",
    // AJOUT D'IMAGES POUR TWITTER
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3b82f6" },
    { media: "(prefers-color-scheme: dark)", color: "#1f2937" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="flex flex-col min-h-screen bg-gray-50">
        <GlobalProvider>
          <ServiceWorkerManager />
          <Suspense>
            <Header />
          </Suspense>
          <main className="flex-grow">{children}</main>
          <Footer />
        </GlobalProvider>
      </body>
    </html>
  );
}
