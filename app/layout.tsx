import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

// Force dynamic rendering to prevent WagmiProviderNotFoundError during static prerender.
// Wagmi/RainbowKit hooks require client context that isn't available during SSG.
export const dynamic = 'force-dynamic';
import { Providers } from "./providers";
import { Toaster } from "sonner";
import { BreakReminderWrapper } from "@/components/ResponsibleGaming";

// Use system fonts instead of Google Fonts to avoid build issues
const geistSans = {
  variable: "--font-geist-sans",
  className: "",
};

const geistMono = {
  variable: "--font-geist-mono",
  className: "",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "MORBIUS Lotto",
  description: "MORBIUS 6-of-55 Lottery",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Prosto+One&family=Mitr:wght@700&family=Russo+One&display=swap" rel="stylesheet" />
        {/* Font Awesome for PLINKO icons */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        <div id="app-wrapper" className="app-content-wrapper">
          <Providers>
            {children}
            <Toaster position="top-right" theme="dark" richColors />
            <BreakReminderWrapper />
            <Analytics />
          </Providers>
        </div>
      </body>
    </html>
  );
}
