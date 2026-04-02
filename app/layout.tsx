import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

import { Providers } from "./providers";
import { Toaster } from "sonner";
import { BreakReminderWrapper } from "@/components/ResponsibleGaming";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { GameLockOverlay } from "@/components/shared/GameLockOverlay";

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
  title: "MORBIUS on PulseChain",
  description: "Morbius.io is a web3 gaming platform built on PulseChain. PulseChain is a fast and secure blockchain that is built for the future of web3.",
  icons: {
    icon: [
      { url: '/icons/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/icons/site.webmanifest',
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Font Awesome for PLINKO icons */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        {/* Montserrat for chat messages */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500&display=swap" rel="stylesheet" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        <div id="app-wrapper" className="app-content-wrapper">
          <Providers>
            {children}
            <GameLockOverlay />
            <Toaster position="top-right" theme="dark" richColors />
            <BreakReminderWrapper />
            <ChatSidebar />
            <Analytics />
          </Providers>
        </div>
      </body>
    </html>
  );
}
