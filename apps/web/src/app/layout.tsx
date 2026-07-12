import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    "OrderVora is the ordering platform for restaurants: AI menu import, an AI-built website, online ordering, checkout, kitchen, and delivery — all in one place.",
  openGraph: {
    title: "OrderVora — The Ordering Platform for Your Restaurant",
    description:
      "AI menu import, an AI-built website, online ordering, checkout, kitchen, and delivery — all in one place.",
    type: "website",
    siteName: "OrderVora",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full w-full overflow-x-hidden flex flex-col">{children}</body>
    </html>
  );
}
