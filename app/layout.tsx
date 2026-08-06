import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MainLayout } from "@/components/MainLayout";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Baywater - AI Trading Journal",
  description: "AI-powered trading journal and behavioral analytics platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      style={{
        fontFeatureSettings: "'tnum' on, 'lnum' on",
        fontVariantNumeric: "tabular-nums"
      }}
    >
      <body className="min-h-full flex flex-col bg-canvas text-text-primary">
        <MainLayout>
          {children}
        </MainLayout>
      </body>
    </html>
  );
}
