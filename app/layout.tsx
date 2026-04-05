import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

import { Providers } from "./providers";
import { Toaster } from "sonner";
import { BreakReminderWrapper } from "@/components/ResponsibleGaming";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { GameLockOverlay } from "@/components/shared/GameLockOverlay";
import { ServiceWorkerRegistration } from "@/components/shared/ServiceWorkerRegistration";

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
  themeColor: '#020617',
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "MORBIUS",
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
        {/* PWA: iOS standalone mode (Safari doesn't fully use the web manifest) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Morbius" />

        {/* iOS splash screens (Add to Home Screen launch images) */}
        {/* iPhone 16 Pro Max */}
        <link rel="apple-touch-startup-image" media="(device-width:440px) and (device-height:956px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" href="/icons/splash/iphone-16pm-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:440px) and (device-height:956px) and (-webkit-device-pixel-ratio:3) and (orientation:landscape)" href="/icons/splash/iphone-16pm-landscape.png" />
        {/* iPhone 16 Pro */}
        <link rel="apple-touch-startup-image" media="(device-width:402px) and (device-height:874px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" href="/icons/splash/iphone-16p-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:402px) and (device-height:874px) and (-webkit-device-pixel-ratio:3) and (orientation:landscape)" href="/icons/splash/iphone-16p-landscape.png" />
        {/* iPhone 16/15/14 Plus, Pro Max */}
        <link rel="apple-touch-startup-image" media="(device-width:430px) and (device-height:932px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" href="/icons/splash/iphone-plus-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:430px) and (device-height:932px) and (-webkit-device-pixel-ratio:3) and (orientation:landscape)" href="/icons/splash/iphone-plus-landscape.png" />
        {/* iPhone 16/15/14, Pro */}
        <link rel="apple-touch-startup-image" media="(device-width:393px) and (device-height:852px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" href="/icons/splash/iphone-std-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:393px) and (device-height:852px) and (-webkit-device-pixel-ratio:3) and (orientation:landscape)" href="/icons/splash/iphone-std-landscape.png" />
        {/* iPhone 13/12 Pro */}
        <link rel="apple-touch-startup-image" media="(device-width:390px) and (device-height:844px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" href="/icons/splash/iphone-13-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:390px) and (device-height:844px) and (-webkit-device-pixel-ratio:3) and (orientation:landscape)" href="/icons/splash/iphone-13-landscape.png" />
        {/* iPhone 12/13 Pro Max */}
        <link rel="apple-touch-startup-image" media="(device-width:428px) and (device-height:926px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" href="/icons/splash/iphone-12max-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:428px) and (device-height:926px) and (-webkit-device-pixel-ratio:3) and (orientation:landscape)" href="/icons/splash/iphone-12max-landscape.png" />
        {/* iPhone X/XS/11 Pro */}
        <link rel="apple-touch-startup-image" media="(device-width:375px) and (device-height:812px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" href="/icons/splash/iphone-x-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:375px) and (device-height:812px) and (-webkit-device-pixel-ratio:3) and (orientation:landscape)" href="/icons/splash/iphone-x-landscape.png" />
        {/* iPhone XR/11 */}
        <link rel="apple-touch-startup-image" media="(device-width:414px) and (device-height:896px) and (-webkit-device-pixel-ratio:2) and (orientation:portrait)" href="/icons/splash/iphone-xr-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:414px) and (device-height:896px) and (-webkit-device-pixel-ratio:2) and (orientation:landscape)" href="/icons/splash/iphone-xr-landscape.png" />
        {/* iPhone SE/8/7/6s */}
        <link rel="apple-touch-startup-image" media="(device-width:375px) and (device-height:667px) and (-webkit-device-pixel-ratio:2) and (orientation:portrait)" href="/icons/splash/iphone-se-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:375px) and (device-height:667px) and (-webkit-device-pixel-ratio:2) and (orientation:landscape)" href="/icons/splash/iphone-se-landscape.png" />
        {/* iPad Pro 12.9" */}
        <link rel="apple-touch-startup-image" media="(device-width:1024px) and (device-height:1366px) and (-webkit-device-pixel-ratio:2) and (orientation:portrait)" href="/icons/splash/ipad-12-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:1024px) and (device-height:1366px) and (-webkit-device-pixel-ratio:2) and (orientation:landscape)" href="/icons/splash/ipad-12-landscape.png" />
        {/* iPad Pro 11" */}
        <link rel="apple-touch-startup-image" media="(device-width:834px) and (device-height:1194px) and (-webkit-device-pixel-ratio:2) and (orientation:portrait)" href="/icons/splash/ipad-11-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:834px) and (device-height:1194px) and (-webkit-device-pixel-ratio:2) and (orientation:landscape)" href="/icons/splash/ipad-11-landscape.png" />
        {/* iPad Air */}
        <link rel="apple-touch-startup-image" media="(device-width:820px) and (device-height:1180px) and (-webkit-device-pixel-ratio:2) and (orientation:portrait)" href="/icons/splash/ipad-air-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:820px) and (device-height:1180px) and (-webkit-device-pixel-ratio:2) and (orientation:landscape)" href="/icons/splash/ipad-air-landscape.png" />
        {/* iPad Mini */}
        <link rel="apple-touch-startup-image" media="(device-width:744px) and (device-height:1133px) and (-webkit-device-pixel-ratio:2) and (orientation:portrait)" href="/icons/splash/ipad-mini-portrait.png" />
        <link rel="apple-touch-startup-image" media="(device-width:744px) and (device-height:1133px) and (-webkit-device-pixel-ratio:2) and (orientation:landscape)" href="/icons/splash/ipad-mini-landscape.png" />

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
            <ServiceWorkerRegistration />
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
