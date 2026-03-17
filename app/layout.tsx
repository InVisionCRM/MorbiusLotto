import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

// Force dynamic rendering to prevent WagmiProviderNotFoundError during static prerender.
// Wagmi/RainbowKit hooks require client context that isn't available during SSG.
export const dynamic = 'force-dynamic';
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
      { url: '/favicon.ico/favicon.ico', sizes: 'any' },
      { url: '/favicon.ico/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [{ url: '/favicon.ico/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/favicon.ico/site.webmanifest',
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
        <link href="https://fonts.googleapis.com/css2?family=Autour+One&family=Climate+Crisis:YEAR@1979&family=Grandstander:ital,wght@0,700;1,700&family=Jost:wght@400;700&family=Monoton&family=Noto+Sans+Mono:wdth,wght@95.2,100..900&family=Poppins:wght@400;500;600;700&family=Prosto+One&family=Mitr:wght@700&family=Russo+One&display=swap" rel="stylesheet" />
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
