import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Body/label text face for the OrderVora design system (Geist stays the display face).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "OrderVora — The Ordering Platform for Your Restaurant",
    template: "%s | OrderVora",
  },
  description:
    "OrderVora is the ordering platform for restaurants: menu import, a ready-made storefront, online ordering, checkout, kitchen, and delivery — all in one place.",
  openGraph: {
    title: "OrderVora — The Ordering Platform for Your Restaurant",
    description:
      "Menu import, a ready-made storefront, online ordering, checkout, kitchen, and delivery — all in one place.",
    type: "website",
    siteName: "OrderVora",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full w-full overflow-x-hidden flex flex-col">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
