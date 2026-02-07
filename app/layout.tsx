import type { Metadata } from "next";
import "./globals.css";
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

export const metadata: Metadata = {
  title: "MORBIUS Lotto",
  description: "MORBIUS 6-of-55 Lottery",
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
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
          </Providers>
        </div>
      </body>
    </html>
  );
}
